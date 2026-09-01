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
 * Code-mode sandbox assembly for promotion widgets ("upload your own HTML +
 * CSS + JS" pages — `PromoPageV2` with `mode: "code"`, see promoSchema.ts).
 *
 * SECURITY MODEL — read this before touching the `sandbox` attribute below.
 *
 * A code-mode page lets an admin — and, via the deliberate MCP publish
 * exception, an LLM acting on an admin's behalf (see
 * apps/mcp/src/mcp/promotionTools.ts) — upload raw HTML/CSS/JS that a
 * CUSTOMER's browser will execute on getsweepr.com properties. That script
 * must never be able to:
 *   - read the parent page's cookies, localStorage, sessionStorage, or DOM
 *     (session hijack, credential theft, CSRF-token exfiltration)
 *   - reach window.parent / window.top at all (cross-origin frames can't)
 *   - navigate the top-level window or break the customer out of the page
 *   - carry credentials on a fetch/XHR to api.getsweepr.com or any other
 *     first-party origin
 *
 * The boundary is the iframe's `sandbox` ATTRIBUTE, not anything inside the
 * srcdoc string. A CSP meta tag inside the document is layered in below as
 * defense-in-depth / an early warning in browsers that honor it, but it is
 * NOT the real boundary — the widget's own script trivially "controls" its
 * own document, so a tag inside it can never be trusted as the guarantee.
 * The guarantee is entirely external to the srcdoc content:
 *
 *     sandbox="allow-scripts"
 *
 * Scripts run — the widget is genuinely interactive — but WITHOUT
 * `allow-same-origin` in that token list, the browser loads the frame into
 * a fresh, opaque, unique origin every single time, no matter what the
 * srcdoc claims about itself. An opaque origin cannot:
 *   - read `document.cookie` (empty string / throws — it's a different
 *     origin, full stop)
 *   - open `window.localStorage` / `window.sessionStorage` for the host site
 *   - script `window.parent` or `window.top` (standard cross-origin frame
 *     access rules apply — SOP blocks it)
 *   - have a `fetch`/`XHR` to api.getsweepr.com succeed with credentials, or
 *     usually at all (an opaque `Origin: null` is not on any CORS allowlist)
 *
 * We deliberately grant NOTHING beyond `allow-scripts`: no
 * `allow-top-navigation`, no `allow-popups`, no `allow-forms`, and — this is
 * the one that matters — never `allow-same-origin`. Combining
 * `allow-same-origin` with `allow-scripts` on a `srcdoc` frame is the
 * specific pattern MDN's own sandbox documentation warns against: it lets
 * the framed document's script detect that its effective origin equals the
 * embedding page's, which can defeat the isolation the sandbox is there to
 * provide. `PROMO_CODE_IFRAME_SANDBOX` below is exported as the single
 * source of truth precisely so no call site can drift into adding it.
 *
 * Every renderer of a code-mode page — the admin editor's live preview AND
 * the real customer-facing PromoWidget — MUST use `assemblePromoCodeSrcdoc`
 * from this file (never hand-roll the HTML) and MUST set the iframe's
 * `sandbox` to exactly `PROMO_CODE_IFRAME_SANDBOX`, so preview and
 * production can never drift and no call site can accidentally loosen it.
 */

export interface PromoCodeContent {
  html: string;
  css?: string;
  js?: string;
}

/**
 * The ONLY acceptable `sandbox` attribute value for a code-mode promo
 * iframe. Deliberately excludes `allow-same-origin` — see the module
 * docblock. Import this constant rather than writing the string literal so
 * a future edit can't silently widen it at one call site.
 */
export const PROMO_CODE_IFRAME_SANDBOX = "allow-scripts";

/** Extra `<iframe>` attributes every code-mode renderer should set,
 *  spreadable directly onto a React `<iframe>`. */
export const PROMO_CODE_IFRAME_PROPS = {
  sandbox: PROMO_CODE_IFRAME_SANDBOX,
  referrerPolicy: "no-referrer" as const,
  loading: "lazy" as const,
};

/**
 * A restrictive CSP for the assembled document. Layered defense-in-depth on
 * top of the sandbox attribute (see module docblock) — it blocks the
 * widget's inline script from loading further remote scripts, connecting
 * out to any origin, or framing another page inside itself, in browsers
 * that enforce a `srcdoc` document's own `<meta>` CSP. `img-src`/`font-src`
 * stay open (`*` + `data:`/`blob:`) because a code-mode widget legitimately
 * wants to show images/fonts from R2 or elsewhere; `connect-src 'none'` and
 * no `default-src` script/style token widening keep everything else closed.
 */
const PROMO_CODE_CSP =
  "default-src 'none'; " +
  "img-src * data: blob:; " +
  "media-src * data: blob:; " +
  "font-src * data:; " +
  "style-src 'unsafe-inline'; " +
  "script-src 'unsafe-inline'; " +
  "connect-src 'none'; " +
  "form-action 'none'; " +
  "frame-src 'none'; " +
  "frame-ancestors 'self';";

/**
 * Assemble the sandboxed iframe `srcdoc` for one code-mode page. Pure and
 * deterministic — called by BOTH the admin editor's live preview and the
 * real `PromoWidget` renderer (`packages/ui/src/components/PromoWidget.tsx`)
 * so "what you designed" and "what ships" can never diverge. Does NOT
 * enforce the size cap itself (that's a save-time schema concern — see
 * `validatePromoDesignV2Structure` in promoSchema.ts); this only assembles.
 *
 * The inline script is wrapped in try/catch so one broken widget script
 * fails soundlessly inside its own frame instead of leaving a blank
 * half-rendered iframe with no signal.
 */
export function assemblePromoCodeSrcdoc(code: PromoCodeContent): string {
  const html = code.html ?? "";
  const css = code.css ?? "";
  const js = code.js ?? "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${PROMO_CODE_CSP}">
<style>
html, body { margin: 0; padding: 0; }
${css}
</style>
</head>
<body>
${html}
<script>
try {
${js}
} catch (promoWidgetError) {
  // A broken widget script must not blank the customer's page or throw an
  // unhandled error into the console loop — it just stops running.
  console.error("Promo code-mode widget error:", promoWidgetError);
}
</script>
</body>
</html>`;
}
