/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Booking-calendar date rules engine (migration 106, calendar_date_rules).
 *
 * Admins block out dates or attach per-date pricing/coupon behavior, either
 * platform-wide (service_area_id NULL) or scoped to one service area. This lib
 * owns rule matching + precedence + the money math so the booking flow, the
 * public availability endpoint, and the admin console all agree.
 *
 * MATCHING: a booking matches a rule when its LOCAL calendar date (the date
 * the customer picked — lib/localDate.ts, never the UTC date of the instant)
 * equals rule_date, and the rule is platform-wide or scoped to the service
 * area the booking address resolves to (lib/serviceAreaGeo.ts). A booking
 * whose address can't be resolved to an area (no coordinates / outside every
 * live area) matches platform-wide rules only.
 *
 * PRECEDENCE (documented in migration 106):
 *   * block            — union: a platform-wide OR an area block blocks.
 *   * price_adjustment — an area-specific rule OVERRIDES a platform-wide rule
 *                        on the same date; they never stack.
 *   * coupon           — same override semantics as price_adjustment.
 *
 * PRICE ADJUSTMENT MATH: applied to the pre-tax service subtotal (the pricing
 * engine's customer total minus its tax component — so it lands AFTER any v2
 * engine minimum-booking floor), identically for the legacy chain and Pricing
 * v2. 'percent' values are whole percents (10 = +10%, -15 = 15% off); 'flat'
 * values are integer cents (negative = discount). A negative adjustment is
 * clamped so it can never push the subtotal below zero.
 */

import type { Sql } from "./db";
import { grantCoupon, type CouponRow } from "./coupons";

export type CalendarRuleKind = "block" | "price_adjustment" | "coupon";

export interface CalendarRuleRow {
  id: string;
  rule_date: string; // "YYYY-MM-DD" (DATE column)
  service_area_id: string | null;
  kind: CalendarRuleKind;
  adjustment_type: "percent" | "flat" | null;
  adjustment_value: number | null;
  coupon_kind: "percent_off" | "amount_off" | null;
  coupon_value: number | null;
  label: string;
  reason: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** The rules that actually govern one (date, area) after precedence. */
export interface EffectiveDateRules {
  /** True when any matching block rule exists (platform-wide OR area). */
  blocked: boolean;
  block: CalendarRuleRow | null;
  /** Area-specific overrides platform-wide; never both. */
  adjustment: CalendarRuleRow | null;
  coupon: CalendarRuleRow | null;
}

/**
 * Precedence resolution over the active rules matching one date. `rules` must
 * already be filtered to (platform-wide OR the booking's area) for the date —
 * this picks which of them actually apply.
 */
export function pickEffectiveRules(
  rules: CalendarRuleRow[],
  areaId: string | null,
): EffectiveDateRules {
  const forKind = (kind: CalendarRuleKind): CalendarRuleRow | null => {
    const candidates = rules.filter((r) => r.kind === kind && r.active);
    // Area-specific beats platform-wide (never stacks with it).
    const area = areaId ? candidates.find((r) => r.service_area_id === areaId) : undefined;
    return area ?? candidates.find((r) => r.service_area_id === null) ?? null;
  };
  const block = forKind("block");
  return {
    blocked: block !== null,
    block,
    adjustment: forKind("price_adjustment"),
    coupon: forKind("coupon"),
  };
}

/** Active rules matching one local date for a scope (platform + that area). */
export async function getEffectiveDateRules(
  sql: Sql,
  localDate: string,
  areaId: string | null,
): Promise<EffectiveDateRules> {
  const rows = (await sql`
    SELECT * FROM calendar_date_rules
    WHERE rule_date = ${localDate} AND active = TRUE
      AND (service_area_id IS NULL OR service_area_id = ${areaId})
  `) as CalendarRuleRow[];
  return pickEffectiveRules(rows, areaId);
}

/**
 * Cents to add to (negative: subtract from) the customer total for a date
 * price-adjustment rule, computed on the pre-tax service subtotal (post any
 * engine minimum). Discounts clamp at the subtotal — the operational layer
 * can reduce a booking to $0 but never below.
 */
export function computeDateAdjustmentCents(
  rule: Pick<CalendarRuleRow, "adjustment_type" | "adjustment_value">,
  preTaxSubtotalCents: number,
): number {
  const value = rule.adjustment_value ?? 0;
  const raw =
    rule.adjustment_type === "percent"
      ? Math.round((preTaxSubtotalCents * value) / 100)
      : value;
  return Math.max(raw, -Math.max(preTaxSubtotalCents, 0));
}

/** Customer-facing message for a blocked date. Never exposes the reason. */
export const BLOCKED_DATE_MESSAGE =
  "This date is not available for booking. Please choose a different date.";

/**
 * Expand a bulk creation request into individual rule dates (inclusive range,
 * optional weekday filter, 0=Sun..6=Sat). Dates are treated as plain calendar
 * dates (parsed at UTC noon so DST can never shift a day). Returns [] for an
 * inverted range; the route caps the range length before calling this.
 */
export function expandRuleDates(
  startDate: string,
  endDate: string,
  weekdays?: number[] | null,
): string[] {
  const start = new Date(`${startDate}T12:00:00Z`).getTime();
  const end = new Date(`${endDate}T12:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const filter = weekdays && weekdays.length > 0 ? new Set(weekdays) : null;
  const out: string[] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t);
    if (filter && !filter.has(d.getUTCDay())) continue;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Mint the per-customer coupon a date coupon-rule promises, so the existing
 * best-coupon auto-apply engine (lib/coupons.ts autoApplyBestCoupon, which
 * runs right after booking creation) can pick it up and let it COMPETE with
 * whatever the customer already holds — a better existing coupon wins, and
 * the DB's one-redemption-per-(coupon, booking) lock means nothing ever
 * stacks twice. Idempotent per (rule, customer): the migration-106 unique
 * index rejects a second grant, in which case grantCoupon returns null and
 * this is a no-op (the customer already claimed this date promotion once).
 *
 * The coupon is single-use and valid for 1 day, so if a better coupon wins
 * the contest today the date grant can't linger and discount an unrelated
 * future booking.
 */
export async function grantDateRuleCoupon(
  sql: Sql,
  args: { userId: string; rule: CalendarRuleRow },
): Promise<CouponRow | null> {
  const { rule } = args;
  if (rule.kind !== "coupon" || !rule.coupon_kind || !rule.coupon_value) return null;
  return grantCoupon(sql, {
    userId: args.userId,
    template: {
      kind: rule.coupon_kind,
      value: rule.coupon_value,
      title: rule.label,
      validDays: 1,
      maxRedemptions: 1,
    },
    source: "calendar",
    sourceRef: rule.id,
  });
}

/** Availability summary the customer wizard needs for one date — labels only,
 *  never internal reasons or rule internals. */
export interface PublicDayInfo {
  date: string;
  blocked?: boolean;
  /** Label of the price adjustment applying on this date, if any. */
  adjustmentLabel?: string;
  /** Label of the automatic date promotion applying on this date, if any. */
  promoLabel?: string;
}

/**
 * Public month/range availability: for each date in [from, to] that carries
 * any effective rule for the given scope, one compact entry. Dates with no
 * rules are omitted (the common case — keeps the payload tiny).
 */
export async function publicAvailability(
  sql: Sql,
  from: string,
  to: string,
  areaId: string | null,
): Promise<PublicDayInfo[]> {
  const rows = (await sql`
    SELECT * FROM calendar_date_rules
    WHERE rule_date >= ${from} AND rule_date <= ${to} AND active = TRUE
      AND (service_area_id IS NULL OR service_area_id = ${areaId})
    ORDER BY rule_date ASC
  `) as CalendarRuleRow[];

  const byDate = new Map<string, CalendarRuleRow[]>();
  for (const r of rows) {
    const key = String(r.rule_date).slice(0, 10);
    const list = byDate.get(key) ?? [];
    list.push(r);
    byDate.set(key, list);
  }

  const out: PublicDayInfo[] = [];
  for (const [date, list] of byDate) {
    const eff = pickEffectiveRules(list, areaId);
    const entry: PublicDayInfo = { date };
    if (eff.blocked) entry.blocked = true;
    // A blocked date takes no bookings, so its pricing/promo labels are noise.
    if (!eff.blocked && eff.adjustment) entry.adjustmentLabel = eff.adjustment.label;
    if (!eff.blocked && eff.coupon) entry.promoLabel = eff.coupon.label;
    if (entry.blocked || entry.adjustmentLabel || entry.promoLabel) out.push(entry);
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
