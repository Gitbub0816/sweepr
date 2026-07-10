/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useState } from "react";
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
export interface PromoDesign {
  theme?: "light" | "dark" | "brand";
  background?: string;
  accent?: string;
  blocks: PromoBlock[];
}
export interface PromoCTA {
  label: string;
  action: "claim" | "link" | "dismiss";
  url?: string;
  requireField?: "none" | "email" | "phone";
  successMessage?: string;
}
export interface PromoView {
  id: string;
  slug: string;
  name: string;
  design: PromoDesign;
  cta: PromoCTA;
  grantsFoundingMember?: boolean;
}

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;
const headingSize = { sm: "text-lg", md: "text-xl", lg: "text-2xl", xl: "text-3xl" } as const;

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
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

/**
 * Renders one designed promotion page (PowerPoint-style single slide) plus its
 * templated CTA. Purely presentational: the host supplies `onClaim` /
 * `onDismiss` and handles the API + auth, so the same widget works on the
 * marketing site (anonymous) and inside the authenticated apps.
 */
export function PromoWidget({
  promo,
  onClaim,
  onDismiss,
  className,
}: {
  promo: PromoView;
  onClaim?: (fields: { email?: string; phone?: string }) => Promise<{ ok: boolean; message?: string }>;
  onDismiss?: () => void;
  className?: string;
}) {
  const { design, cta } = promo;
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requireField = cta.requireField ?? "none";
  const theme = design.theme ?? "light";
  const accent = design.accent;

  async function handleCta() {
    if (cta.action === "dismiss") return onDismiss?.();
    if (cta.action === "link" && cta.url) {
      window.open(cta.url, "_blank", "noopener,noreferrer");
      return;
    }
    // action === "claim"
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
      if (res?.ok) setDone(res.message ?? cta.successMessage ?? "You're all set!");
      else setError(res?.message ?? "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "relative w-full max-w-md overflow-hidden rounded-2xl p-6 shadow-xl",
        theme === "dark"
          ? "bg-slate-900 text-white"
          : theme === "brand"
            ? "bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
            : "bg-white text-slate-900",
        className,
      )}
      style={design.background ? { background: design.background } : undefined}
      role="dialog"
      aria-label={promo.name}
    >
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1 text-lg leading-none opacity-50 hover:opacity-100"
        >
          ✕
        </button>
      ) : null}

      <div className="space-y-3">
        {design.blocks?.map((b, i) => <Block key={i} block={b} accent={accent} />)}
      </div>

      <div className="mt-5">
        {done ? (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            {done}
          </p>
        ) : (
          <>
            {cta.action === "claim" && requireField !== "none" ? (
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
              onClick={handleCta}
              disabled={busy}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60"
              style={{ background: accent ?? "#0f766e" }}
            >
              {busy ? "Working…" : cta.label}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
