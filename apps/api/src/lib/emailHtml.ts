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
 * Sanitize inbound email HTML for display in the admin Mail tab.
 *
 * Workers have no DOM, so this is a conservative regex sanitizer: it removes
 * every script-capable construct and event handler while keeping the inline
 * styles / tables / links that real marketing + transactional emails are built
 * from. The admin app's CSP (no inline script, restricted connect/frame-src)
 * is the second layer of defense behind this.
 */

const MAX_HTML_BYTES = 500_000;

/** Tags whose entire content must go (not just the tags themselves). */
const DROP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript", "template", "head", "title", "svg", "math"];
/** Tags stripped but whose inner content is kept. */
const DROP_TAG_ONLY = ["form", "input", "button", "select", "textarea", "link", "meta", "base", "frame", "frameset", "applet", "audio", "video", "source", "dialog", "portal", "slot"];

export function sanitizeEmailHtml(raw: string): string {
  if (!raw) return "";
  let html = raw.length > MAX_HTML_BYTES ? raw.slice(0, MAX_HTML_BYTES) : raw;

  // Strip HTML comments (incl. conditional comments that can smuggle markup).
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    // Unclosed variants (e.g. a lone <style> to EOF).
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>`, "gi"), "");
  }
  for (const tag of DROP_TAG_ONLY) {
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }

  // Remove inline event handlers (onclick=…, onerror=…, with any quoting).
  // The separator before the handler may be whitespace OR a `/` — browsers treat
  // `<img/onerror=…>` identically to `<img onerror=…>`, so a leading-`\s`-only
  // match let the slash-separated vector survive. Match `[\s/]` and replace with
  // a single space so adjacent tokens don't fuse. The third pass also catches
  // unquoted handler values.
  html = html.replace(/[\s/]on[a-z]+\s*=\s*"[^"]*"/gi, " ");
  html = html.replace(/[\s/]on[a-z]+\s*=\s*'[^']*'/gi, " ");
  html = html.replace(/[\s/]on[a-z]+\s*=\s*[^\s>]+/gi, " ");

  // Neutralize scriptable / non-image URLs in href/src/etc. Allows http(s),
  // mailto, tel, and a strict subset of data:image (inline raster images some
  // clients embed) — data:image/svg+xml is REJECTED because SVG can carry
  // scripts. Both quoted AND unquoted attribute values are sanitized, and the
  // separator may be whitespace or `/`.
  const urlAttrs = "href|src|action|formaction|xlink:href|background";
  const urlOk = (rawVal: string): boolean =>
    // Collapse whitespace/control chars so "java\nscript:" can't sneak through.
    /^(https?:|mailto:|tel:|data:image\/(?:png|jpe?g|gif|webp)[;,]|#|\/)/i.test(
      rawVal.replace(/[\s\x00-\x1f]+/g, ""),
    );
  // Quoted values.
  html = html.replace(
    new RegExp(`[\\s/](${urlAttrs})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "gi"),
    (_m, attr: string, dq?: string, sq?: string) => {
      const val = dq ?? sq ?? "";
      return urlOk(val) ? ` ${attr}="${val.replace(/"/g, "&quot;")}"` : " ";
    },
  );
  // Unquoted values (e.g. src=javascript:alert(1)) — previously untouched, so a
  // scriptable scheme in an unquoted attribute slipped past the sanitizer.
  html = html.replace(
    new RegExp(`[\\s/](${urlAttrs})\\s*=\\s*([^\\s"'>]+)`, "gi"),
    (_m, attr: string, val: string) =>
      urlOk(val) ? ` ${attr}="${val.replace(/"/g, "&quot;")}"` : " ",
  );

  // Kill CSS-based escapes inside style attributes: expression(), url(javascript:…), @import.
  html = html.replace(/style\s*=\s*"([^"]*)"/gi, (_m, css: string) => {
    const cleaned = css
      .replace(/expression\s*\(/gi, "blocked(")
      .replace(/url\s*\(\s*(['"]?)\s*javascript:/gi, "url($1blocked:")
      .replace(/@import/gi, "");
    return `style="${cleaned}"`;
  });

  // Every link opens in a new tab and never gets window.opener.
  html = html.replace(/<a\b([^>]*)>/gi, (_m, attrs: string) => {
    const cleaned = attrs
      .replace(/\starget\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\srel\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return `<a${cleaned} target="_blank" rel="noopener noreferrer nofollow">`;
  });

  return html.trim();
}

/** True when the HTML body has real markup worth rendering (not just text). */
export function looksLikeRichHtml(html: string | null | undefined): boolean {
  if (!html) return false;
  return /<(a|img|table|td|div|p|br|strong|em|b|i|ul|ol|li|h[1-6]|span|blockquote)\b/i.test(html);
}
