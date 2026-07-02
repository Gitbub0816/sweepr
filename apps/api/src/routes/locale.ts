/**
 * Public locale suggestion — IP-based initial language.
 *
 *   GET /locale/suggest  ->  { lang: "fil", country: "PH" }
 *
 * Uses Cloudflare's edge geolocation (request.cf.country / CF-IPCountry).
 * This is only the FIRST-VISIT default: the moment a visitor uses or switches
 * a language, that last-used choice (localStorage + users.preferred_language
 * when signed in) always wins over the IP suggestion.
 */
import { Hono } from "hono";
import type { AppBindings } from "../types";

export const localeRouter = new Hono<AppBindings>();

/** Country -> default UI language for every locale the apps ship. */
const COUNTRY_LANG: Record<string, string> = {
  // Spanish
  ES: "es", MX: "es", CO: "es", AR: "es", PE: "es", VE: "es", CL: "es",
  EC: "es", GT: "es", CU: "es", BO: "es", DO: "es", HN: "es", PY: "es",
  SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", PR: "es",
  // Portuguese
  BR: "pt", PT: "pt", AO: "pt", MZ: "pt",
  // Vietnamese
  VN: "vi",
  // Tagalog
  PH: "fil",
  // Korean
  KR: "ko",
  // Chinese
  CN: "zh-Hans", SG: "zh-Hans", TW: "zh-Hant", HK: "zh-Hant", MO: "zh-Hant",
  // Hindi
  IN: "hi",
  // Arabic
  SA: "ar", AE: "ar", EG: "ar", IQ: "ar", JO: "ar", KW: "ar", LB: "ar",
  OM: "ar", QA: "ar", BH: "ar", YE: "ar", SY: "ar", MA: "ar", DZ: "ar",
  TN: "ar", LY: "ar", SD: "ar",
};

localeRouter.get("/suggest", (c) => {
  const cf = (c.req.raw as { cf?: { country?: string } }).cf;
  const country = (cf?.country ?? c.req.header("CF-IPCountry") ?? "").toUpperCase();
  const lang = COUNTRY_LANG[country] ?? "en";
  // Cacheable per edge colo; the response varies by IP geography, not user.
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ lang, country: country || null });
});
