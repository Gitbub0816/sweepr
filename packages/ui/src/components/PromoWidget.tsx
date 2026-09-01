/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@sweepr/utils";
import {
  assemblePromoCodeSrcdoc,
  PROMO_CODE_IFRAME_SANDBOX,
  PROMO_CODE_IFRAME_PROPS,
  PROMO_CLAIM_ACTIONS,
  type PromoCtaV2,
  type PromoBlockV2,
  type PromoCanvasElementV2,
  type PromoCanvasV2,
  type PromoHotspotV2,
  type PromoPageV2,
  type PromoDesignV2,
  type PromoCodeV2,
  type PromoCtaStyle,
} from "@sweepr/utils";

// ─── Shared promo shape (mirrors the API's public promo view). The v2 type
// names are re-exported under their pre-existing local names so the admin
// components that already `import { type PromoCanvas, type CanvasElement,
// type PromoCTA } from "@sweepr/ui"` keep working unchanged. ────────────────
export type {
  PromoCtaV2 as PromoCTA,
  PromoBlockV2 as PromoBlock,
  PromoCanvasElementV2 as CanvasElement,
  PromoCanvasV2 as PromoCanvas,
  PromoHotspotV2 as PromoHotspot,
  PromoPageV2 as PromoPage,
  PromoDesignV2 as PromoDesign,
  PromoCodeV2 as PromoCode,
};

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
  /** Always PromoDesignV2 — the API normalizes every legacy-shaped row at
   *  the boundary (see apps/api/src/lib/promotions.ts's resolvePromoDesign),
   *  so this renderer never has to know about the old single-page shape. */
  design: PromoDesignV2;
  grantsFoundingMember?: boolean;
  reward?: { coupon?: PromoRewardCoupon };
}

const CLAIMY = new Set(PROMO_CLAIM_ACTIONS as readonly string[]);

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

function Block({ block, accent }: { block: PromoBlockV2; accent?: string }) {
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

export const CANVAS_ASPECTS: Record<NonNullable<PromoCanvasV2["aspect"]>, number> = {
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
  canvas: PromoCanvasV2;
  onCta?: (cta: PromoCtaV2) => void;
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
 * Renders one code-mode page inside a sandboxed iframe. ALWAYS goes through
 * `assemblePromoCodeSrcdoc` (packages/utils/src/promoSandbox.ts) and ALWAYS
 * carries exactly `PROMO_CODE_IFRAME_SANDBOX` ("allow-scripts", deliberately
 * without "allow-same-origin") — see that file's docblock for the full
 * isolation model. The admin editor's live preview uses the same two
 * exports, so preview and production can never drift.
 */
export function CodeModeRender({ code, className }: { code: PromoCodeV2; className?: string }) {
  const srcDoc = useMemo(() => assemblePromoCodeSrcdoc(code), [code]);
  return (
    <iframe
      title="Promotion widget"
      srcDoc={srcDoc}
      sandbox={PROMO_CODE_IFRAME_SANDBOX}
      referrerPolicy={PROMO_CODE_IFRAME_PROPS.referrerPolicy}
      loading={PROMO_CODE_IFRAME_PROPS.loading}
      className={cn("h-[420px] w-full border-0", className)}
    />
  );
}

/** Visual weight for a page-level CTA button. */
function ctaButtonClass(style: PromoCtaStyle | undefined, accent: string | undefined) {
  switch (style) {
    case "secondary":
      return {
        className:
          "w-full rounded-lg border px-4 py-2 text-center text-sm font-medium opacity-80 transition hover:opacity-100",
        style: { borderColor: accent ?? "currentColor" } as React.CSSProperties,
      };
    case "ghost":
      return {
        className: "w-full rounded-lg px-4 py-2 text-center text-sm font-medium opacity-70 transition hover:opacity-100",
        style: undefined,
      };
    case "link":
      return {
        className: "w-full text-center text-sm font-medium underline underline-offset-2 opacity-80 transition hover:opacity-100",
        style: undefined,
      };
    case "primary":
    default:
      return {
        className: "w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60",
        style: { background: accent ?? "#0f766e" } as React.CSSProperties,
      };
  }
}

/**
 * Renders one designed, possibly-multi-page promotion — blocks, a free-form
 * CANVAS, a full-image POSTER with hotspots, or a sandboxed CODE-mode
 * widget — plus however many CTAs the active page carries, including
 * `goto_page` CTAs that navigate between pages client-side. Purely
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
  onClaim?: (fields: {
    email?: string;
    phone?: string;
    ctaId?: string;
    pageKey?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  onDismiss?: () => void;
  signedIn?: boolean;
  signInUrl?: string;
  className?: string;
}) {
  const { design } = promo;
  const [pageKey, setPageKey] = useState(design.entryPageKey);
  const page = design.pages.find((p) => p.key === pageKey) ?? design.pages[0];

  const [activeCta, setActiveCta] = useState<PromoCtaV2 | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offerDeadline, setOfferDeadline] = useState<number | null>(null);

  const anonymous = signedIn === false;

  // Anonymous claims that mint something (coupon / founding / newsletter /
  // waitlist) always capture an email so the reward can attach at sign-up.
  const needsEmailAnonBase =
    anonymous && (promo.grantsFoundingMember || Boolean(promo.reward?.coupon));

  function requireFieldFor(cta: PromoCtaV2): "none" | "email" | "phone" {
    const needsEmailAnon =
      needsEmailAnonBase || (anonymous && (cta.action === "newsletter" || cta.action === "waitlist"));
    const mustSignIn = (cta.claimants ?? "both") === "signed_in" && anonymous && CLAIMY.has(cta.action);
    if (mustSignIn) return "none";
    if (needsEmailAnon && (cta.requireField ?? "none") === "none") return "email";
    return cta.requireField ?? "none";
  }

  function mustSignIn(cta: PromoCtaV2): boolean {
    return (cta.claimants ?? "both") === "signed_in" && anonymous && CLAIMY.has(cta.action);
  }

  function ctaNeedsInput(cta: PromoCtaV2): boolean {
    if (!CLAIMY.has(cta.action)) return false;
    if (mustSignIn(cta)) return false;
    return requireFieldFor(cta) !== "none";
  }

  const theme = page?.theme ?? design.theme ?? "light";
  const accent = page?.accent ?? design.accent;
  const background = page?.background ?? design.background;
  const reward = rewardText(promo.reward);
  const offerMinutes = promo.reward?.coupon?.offerMinutes;

  const defaultSignInUrl =
    promo.audience === "cleaners"
      ? "https://clean.getsweepr.com/sign-in"
      : "https://app.getsweepr.com/sign-in";

  async function execute(cta: PromoCtaV2) {
    if (mustSignIn(cta)) {
      window.location.href = signInUrl ?? defaultSignInUrl;
      return;
    }
    if (cta.action === "dismiss") return onDismiss?.();
    if (cta.action === "link" && cta.url) {
      window.open(cta.url, "_blank", "noopener,noreferrer");
      return;
    }
    // claim-family actions
    const requireField = requireFieldFor(cta);
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
      const res = await onClaim?.({
        ...(requireField === "email" ? { email: value } : requireField === "phone" ? { phone: value } : {}),
        ctaId: cta.id,
        pageKey: page?.key,
      });
      if (res?.ok) {
        setDone(res.message ?? cta.successMessage ?? "You're all set!");
        if (offerMinutes) setOfferDeadline(Date.now() + offerMinutes * 60_000);
        if (cta.action === "book_now" && cta.url) {
          window.location.href = cta.url;
        }
      } else setError(res?.message ?? "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Every CTA click — page CTA button, canvas button, poster hotspot —
   *  funnels through here so `goto_page` and the claim-input flow behave
   *  identically no matter where the CTA lives. */
  function onCtaClick(cta: PromoCtaV2) {
    setError(null);
    if (cta.action === "goto_page" && cta.targetPageKey) {
      setPageKey(cta.targetPageKey);
      setActiveCta(null);
      setValue("");
      return;
    }
    setActiveCta(cta);
    if (!ctaNeedsInput(cta)) void execute(cta);
  }

  if (!page) return null;

  const canvas = page.mode === "canvas" && page.canvas?.elements?.length ? page.canvas : null;
  const poster = page.mode === "poster" && page.poster?.src ? page.poster : null;
  const code = page.mode === "code" && page.code?.html ? page.code : null;
  const fullBleed = Boolean(canvas || poster || code);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-2xl shadow-xl",
        fullBleed ? "max-w-lg" : "max-w-md p-6",
        theme === "dark"
          ? "bg-slate-900 text-white"
          : theme === "brand"
            ? "bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
            : "bg-white text-slate-900",
        className,
      )}
      style={!poster && background ? { background } : undefined}
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
            fullBleed ? "bg-black/40 text-white hover:bg-black/60" : "opacity-50 hover:opacity-100",
          )}
        >
          ✕
        </button>
      ) : null}

      {canvas ? (
        // ── Canvas mode: free-form single slide with interactive buttons ────
        <CanvasRender canvas={canvas} onCta={onCtaClick} />
      ) : poster ? (
        // ── Poster mode: one image, interactive hotspots ────────────────────
        <div className="relative">
          <img src={poster.src} alt={promo.name} className="block w-full" />
          {(poster.hotspots ?? []).map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onCtaClick(h.cta)}
              aria-label={h.cta.label}
              title={h.cta.label}
              className="absolute rounded-md border-2 border-transparent transition hover:border-white/80 hover:bg-white/10 focus:border-white"
              style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%` }}
            />
          ))}
        </div>
      ) : code ? (
        // ── Code mode: sandboxed iframe, no allow-same-origin — see
        //    promoSandbox.ts's docblock for the isolation model ─────────────
        <CodeModeRender code={code} />
      ) : (
        <div className="space-y-3">
          {(page.blocks ?? []).map((b, i) => <Block key={i} block={b} accent={accent} />)}
        </div>
      )}

      <div className={cn("mt-4", fullBleed && "px-5 pb-5")}>
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
        ) : activeCta && ctaNeedsInput(activeCta) ? (
          <div>
            {(() => {
              const requireField = requireFieldFor(activeCta);
              const btn = ctaButtonClass(activeCta.style, accent);
              return (
                <>
                  {requireField !== "none" ? (
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
                    onClick={() => execute(activeCta)}
                    disabled={busy}
                    className={btn.className}
                    style={btn.style}
                  >
                    {busy ? "Working…" : activeCta.label}
                  </button>
                  {(page.ctas?.length ?? 0) > 1 ? (
                    <button
                      type="button"
                      onClick={() => { setActiveCta(null); setError(null); }}
                      className="mt-2 w-full text-center text-xs opacity-60 hover:opacity-100"
                    >
                      Back
                    </button>
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : (page.ctas?.length ?? 0) > 0 ? (
          <div className="space-y-2">
            {page.ctas.map((cta) => {
              const btn = ctaButtonClass(cta.style, accent);
              return (
                <button
                  key={cta.id}
                  type="button"
                  onClick={() => onCtaClick(cta)}
                  className={btn.className}
                  style={btn.style}
                >
                  {mustSignIn(cta) ? "Sign in to claim" : cta.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
