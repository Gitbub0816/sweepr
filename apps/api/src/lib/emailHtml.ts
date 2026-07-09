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
  html = html.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");

  // Neutralize scriptable / non-image URLs in href/src/etc. Allows http(s),
  // mailto, tel, and data:image (inline images some clients embed).
  html = html.replace(
    /\s(href|src|action|formaction|xlink:href|background)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    (_m, attr: string, dq?: string, sq?: string) => {
      // Collapse whitespace/control chars so "java\nscript:" can't sneak through.
      const val = (dq ?? sq ?? "").replace(/[\s\u0000-\u001f]+/g, "");
      const ok = /^(https?:|mailto:|tel:|data:image\/|#|\/)/i.test(val);
      return ok ? ` ${attr}="${(dq ?? sq ?? "").replace(/"/g, "&quot;")}"` : "";
    },
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
