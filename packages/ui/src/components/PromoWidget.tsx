/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@sweepr/utils";

// ─── Shared promo shape (mirrors the API's public promo view) ────────────────
export interface PromoBlock {
  type: "badge" | "heading" | "subheading" | "text" | "image" | "divider" | "spacer" | "bullets";
  text?: string;
  src?: string;
  alt?: string;
  items?: string[];
  align?: "left" | "center" | "right";
  size?: "sm" | "md" | "lg" | "xl";
}
/** An interactive region on a poster image (all values are % of the image). */
export interface PromoHotspot {
  x: number;
  y: number;
  w: number;
  h: number;
  cta: PromoCTA;
}
/**
 * A free-form canvas element (PowerPoint-style, one slide). Geometry is % of
 * the canvas; font sizes are px at the 480px design width and scale with the
 * rendered width. Array order = z-order (later paints on top).
 */
export interface CanvasElement {
  id: string;
  type: "text" | "image" | "shape" | "button";
  x: number; y: number; w: number; h: number;   // %
  rotation?: number;                            // degrees
  // text
  text?: string; fontSize?: number; bold?: boolean; italic?: boolean;
  color?: string; align?: "left" | "center" | "right"; bg?: string;
  // image
  src?: string; fit?: "cover" | "contain"; radius?: number;
  // shape
  shape?: "rect" | "ellipse"; fill?: string; stroke?: string; strokeWidth?: number;
  // button
  cta?: PromoCTA; btnBg?: string; btnColor?: string;
}
export interface PromoCanvas {
  aspect?: "4:5" | "1:1" | "16:9" | "3:4";
  background?: string;        // css color/gradient
  backgroundImage?: string;   // uploaded image url
  elements: CanvasElement[];
}

export interface PromoDesign {
  theme?: "light" | "dark" | "brand";
  background?: string;
  accent?: string;
  blocks: PromoBlock[];
  /** Poster mode: the whole widget is one uploaded image + hotspots. */
  poster?: { src: string; hotspots?: PromoHotspot[] };
  /** Canvas mode: free-form single-slide design (takes precedence). */
  canvas?: PromoCanvas;
}
export interface PromoCTA {
  label: string;
  /** claim/newsletter/waitlist/book_now all record a claim (server runs the
   * side-effect and mints the reward); link opens a URL; dismiss closes. */
  action: "claim" | "newsletter" | "waitlist" | "book_now" | "link" | "dismiss";
  url?: string;
  requireField?: "none" | "email" | "phone";
  claimants?: "anonymous" | "signed_in" | "both";
  secondary?: { label: string; url: string };
  successMessage?: string;
}
export interface PromoRewardCoupon {
  kind: "percent_off" | "amount_off" | "free_addon";
  value?: number;
  addonKey?: string;
  title?: string;
  offerMinutes?: number;
}
export interface PromoView {
  id: string;
  slug: string;
  name: string;
  audience?: string;
  design: PromoDesign;
  cta: PromoCTA;
  grantsFoundingMember?: boolean;
  reward?: { coupon?: PromoRewardCoupon };
}

const CLAIMY = new Set(["claim", "newsletter", "waitlist", "book_now"]);

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;
const headingSize = { sm: "text-lg", md: "text-xl", lg: "text-2xl", xl: "text-3xl" } as const;

export function rewardText(reward?: { coupon?: PromoRewardCoupon }): string | null {
  const cp = reward?.coupon;
  if (!cp) return null;
  if (cp.title) return cp.title;
  if (cp.kind === "percent_off") return `${cp.value ?? 0}% off your next booking`;
  if (cp.kind === "amount_off") return `$${((cp.value ?? 0) / 100).toFixed(2)} off your next booking`;
  return "A free add-on on your next booking";
}

function Block({ block, accent }: { block: PromoBlock; accent?: string }) {
  const align = alignClass[block.align ?? "left"];
  switch (block.type) {
    case "badge":
      return (
        <div className={cn("mb-1", align)}>
          <span
            className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800"
            style={accent ? { borderColor: accent, color: accent } : undefined}
          >
            {block.text}
          </span>
        </div>
      );
    case "heading":
      return (
        <h2 className={cn("font-bold leading-tight", headingSize[block.size ?? "lg"], align)}>
          {block.text}
        </h2>
      );
    case "subheading":
      return <h3 className={cn("text-base font-semibold opacity-90", align)}>{block.text}</h3>;
    case "text":
      return <p className={cn("text-sm leading-relaxed opacity-90", align)}>{block.text}</p>;
    case "bullets":
      return (
        <ul className="space-y-1.5 text-sm">
          {(block.items ?? []).map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden style={accent ? { color: accent } : undefined} className="mt-0.5">
                ✓
              </span>
              <span className="opacity-90">{it}</span>
            </li>
          ))}
        </ul>
      );
    case "image":
      return block.src ? (
        <div className={align}>
          <img
            src={block.src}
            alt={block.alt ?? ""}
            className="mx-auto max-h-48 w-auto rounded-lg object-contain"
          />
        </div>
      ) : null;
    case "divider":
      return <hr className="my-2 border-black/10 dark:border-white/10" />;
    case "spacer":
      return <div className="h-3" />;
    default:
      return null;
  }
}

/** mm:ss countdown to a deadline; calls onDone once when it hits zero. */
function Countdown({ deadline, onDone }: { deadline: number; onDone?: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, deadline - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const ms = Math.max(0, deadline - Date.now());
      setLeft(ms);
      if (ms === 0) {
        clearInterval(t);
        onDone?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, onDone]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className="tabular-nums font-bold">
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

export const CANVAS_ASPECTS: Record<NonNullable<PromoCanvas["aspect"]>, number> = {
  "4:5": 125, "1:1": 100, "16:9": 56.25, "3:4": 133.33,
};
const CANVAS_DESIGN_WIDTH = 480;

/** Shared renderer for the free-form canvas — used by the live widget AND the
 * admin editor preview so what you design is exactly what ships. */
export function CanvasRender({
  canvas,
  onCta,
  className,
}: {
  canvas: PromoCanvas;
  onCta?: (cta: PromoCTA) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / CANVAS_DESIGN_WIDTH));
    ro.observe(el);
    setScale(el.clientWidth / CANVAS_DESIGN_WIDTH);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("relative w-full overflow-hidden", className)}
      style={{
        paddingTop: `${CANVAS_ASPECTS[canvas.aspect ?? "4:5"]}%`,
        background: canvas.background ?? "#ffffff",
      }}
    >
      {canvas.backgroundImage ? (
        <img src={canvas.backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      {canvas.elements.map((el) => {
        const base: React.CSSProperties = {
          left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`,
          transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        };
        if (el.type === "text") {
          return (
            <div key={el.id} className="absolute flex flex-col justify-center" style={{
              ...base,
              fontSize: (el.fontSize ?? 18) * scale,
              fontWeight: el.bold ? 700 : 400,
              fontStyle: el.italic ? "italic" : undefined,
              color: el.color ?? "#111827",
              textAlign: el.align ?? "left",
              background: el.bg || undefined,
              borderRadius: el.radius ? el.radius * scale : undefined,
              lineHeight: 1.25,
              whiteSpace: "pre-wrap",
              overflow: "hidden",
              padding: 2 * scale,
            }}>
              {el.text}
            </div>
          );
        }
        if (el.type === "image" && el.src) {
          return (
            <img key={el.id} src={el.src} alt="" className="absolute" style={{
              ...base, objectFit: el.fit ?? "cover",
              borderRadius: (el.radius ?? 0) * scale,
            }} />
          );
        }
        if (el.type === "shape") {
          return (
            <div key={el.id} className="absolute" style={{
              ...base,
              background: el.fill ?? "#0f766e",
              border: el.stroke ? `${(el.strokeWidth ?? 2) * scale}px solid ${el.stroke}` : undefined,
              borderRadius: el.shape === "ellipse" ? "50%" : (el.radius ?? 0) * scale,
            }} />
          );
        }
        if (el.type === "button" && el.cta) {
          return (
            <button key={el.id} type="button" onClick={() => onCta?.(el.cta!)} className="absolute font-semibold shadow-sm transition hover:brightness-110" style={{
              ...base,
              background: el.btnBg ?? "#0f766e",
              color: el.btnColor ?? "#ffffff",
              fontSize: (el.fontSize ?? 16) * scale,
              borderRadius: (el.radius ?? 8) * scale,
            }}>
              {el.cta.label}
            </button>
          );
        }
        return null;
      })}
    </div>
  );
}

/**
 * Renders one designed promotion — either stacked blocks or a full-image
 * POSTER with interactive hotspots — plus its templated CTA. Purely
 * presentational: the host supplies `onClaim` / `onDismiss` and handles the
 * API + auth, so the same widget works on the marketing site (anonymous) and
 * inside the authenticated apps. Flash offers (reward.coupon.offerMinutes)
 * show a live countdown after claiming.
 */
export function PromoWidget({
  promo,
  onClaim,
  onDismiss,
  signedIn,
  signInUrl,
  className,
}: {
  promo: PromoView;
  onClaim?: (fields: { email?: string; phone?: string }) => Promise<{ ok: boolean; message?: string }>;
  onDismiss?: () => void;
  signedIn?: boolean;
  signInUrl?: string;
  className?: string;
}) {
  const { design } = promo;
  const [activeCta, setActiveCta] = useState<PromoCTA>(promo.cta);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offerDeadline, setOfferDeadline] = useState<number | null>(null);

  const anonymous = signedIn === false;
  const cta = activeCta;
  const isClaimy = CLAIMY.has(cta.action);
  const mustSignIn = (cta.claimants ?? "both") === "signed_in" && anonymous && isClaimy;

  // Anonymous claims that mint something (coupon / founding / newsletter /
  // waitlist) always capture an email so the reward can attach at sign-up.
  const needsEmailAnon =
    anonymous &&
    (promo.grantsFoundingMember ||
      Boolean(promo.reward?.coupon) ||
      cta.action === "newsletter" ||
      cta.action === "waitlist");
  const requireField: "none" | "email" | "phone" =
    !mustSignIn && needsEmailAnon && (cta.requireField ?? "none") === "none"
      ? "email"
      : (cta.requireField ?? "none");

  const theme = design.theme ?? "light";
  const accent = design.accent;
  const reward = rewardText(promo.reward);
  const offerMinutes = promo.reward?.coupon?.offerMinutes;

  const defaultSignInUrl =
    promo.audience === "cleaners"
      ? "https://clean.getsweepr.com/sign-in"
      : "https://app.getsweepr.com/sign-in";

  async function execute(target: PromoCTA) {
    if ((target.claimants ?? "both") === "signed_in" && anonymous && CLAIMY.has(target.action)) {
      window.location.href = signInUrl ?? defaultSignInUrl;
      return;
    }
    if (target.action === "dismiss") return onDismiss?.();
    if (target.action === "link" && target.url) {
      window.open(target.url, "_blank", "noopener,noreferrer");
      return;
    }
    // claim-family actions
    if (requireField === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setError("Please enter a valid email.");
      return;
    }
    if (requireField === "phone" && value.replace(/\D/g, "").length < 10) {
      setError("Please enter a valid phone number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onClaim?.(
        requireField === "email" ? { email: value } : requireField === "phone" ? { phone: value } : {},
      );
      if (res?.ok) {
        setDone(res.message ?? target.successMessage ?? "You're all set!");
        if (offerMinutes) setOfferDeadline(Date.now() + offerMinutes * 60_000);
        if (target.action === "book_now" && target.url) {
          window.location.href = target.url;
        }
      } else setError(res?.message ?? "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function onHotspot(h: PromoHotspot) {
    setActiveCta(h.cta);
    const claimy = CLAIMY.has(h.cta.action);
    const willNeedInput =
      claimy && !((h.cta.claimants ?? "both") === "signed_in" && anonymous) &&
      ((h.cta.requireField ?? "none") !== "none" || needsEmailAnon);
    if (!willNeedInput) void execute(h.cta);
  }

  const canvas = design.canvas?.elements?.length ? design.canvas : null;
  const poster = !canvas && design.poster?.src ? design.poster : null;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-2xl shadow-xl",
        canvas || poster ? "max-w-lg" : "max-w-md p-6",
        theme === "dark"
          ? "bg-slate-900 text-white"
          : theme === "brand"
            ? "bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
            : "bg-white text-slate-900",
        className,
      )}
      style={!poster && design.background ? { background: design.background } : undefined}
      role="dialog"
      aria-label={promo.name}
    >
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className={cn(
            "absolute right-3 top-3 z-10 rounded-full p-1 text-lg leading-none",
            canvas || poster ? "bg-black/40 text-white hover:bg-black/60" : "opacity-50 hover:opacity-100",
          )}
        >
          ✕
        </button>
      ) : null}

      {canvas ? (
        // ── Canvas mode: free-form single slide with interactive buttons ────
        <CanvasRender
          canvas={canvas}
          onCta={(target) => {
            setActiveCta(target);
            const claimy = CLAIMY.has(target.action);
            const willNeedInput =
              claimy && !((target.claimants ?? "both") === "signed_in" && anonymous) &&
              ((target.requireField ?? "none") !== "none" || needsEmailAnon);
            if (!willNeedInput) void execute(target);
          }}
        />
      ) : poster ? (
        // ── Poster mode: one image, interactive hotspots ────────────────────
        <div className="relative">
          <img src={poster.src} alt={promo.name} className="block w-full" />
          {(poster.hotspots ?? []).map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onHotspot(h)}
              aria-label={h.cta.label}
              title={h.cta.label}
              className="absolute rounded-md border-2 border-transparent transition hover:border-white/80 hover:bg-white/10 focus:border-white"
              style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%` }}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {design.blocks?.map((b, i) => <Block key={i} block={b} accent={accent} />)}
        </div>
      )}

      <div className={cn("mt-4", (poster || canvas) && "px-5 pb-5")}>
        {reward && !done ? (
          <p className="mb-2 text-center text-sm font-semibold" style={{ color: accent ?? "#0f766e" }}>
            🎁 {reward}
            {offerMinutes ? `, valid ${offerMinutes} min after claiming` : ""}
          </p>
        ) : null}

        {done ? (
          <div className="rounded-lg bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            <p>{done}</p>
            {offerDeadline ? (
              <p className="mt-1">
                ⏱ Offer expires in <Countdown deadline={offerDeadline} />
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {isClaimy && !mustSignIn && requireField !== "none" ? (
              <input
                type={requireField === "email" ? "email" : "tel"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={requireField === "email" ? "you@example.com" : "(555) 555-5555"}
                className="mb-2 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-seafoam-500 dark:border-white/20 dark:bg-slate-800 dark:text-white"
              />
            ) : null}
            {error ? <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
            <button
              type="button"
              onClick={() => execute(cta)}
              disabled={busy}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60"
              style={{ background: accent ?? "#0f766e" }}
            >
              {busy ? "Working…" : mustSignIn ? "Sign in to claim" : cta.label}
            </button>
            {cta.secondary?.label && cta.secondary.url ? (
              <a
                href={cta.secondary.url}
                className="mt-2 block w-full rounded-lg border border-black/15 px-4 py-2 text-center text-sm font-medium opacity-80 transition hover:opacity-100 dark:border-white/20"
              >
                {cta.secondary.label}
              </a>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
