import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en/common.json";
import es from "./locales/es/common.json";
import vi from "./locales/vi/common.json";
import zhHans from "./locales/zh-Hans/common.json";
import zhHant from "./locales/zh-Hant/common.json";
import fil from "./locales/fil/common.json";
import ko from "./locales/ko/common.json";
import ar from "./locales/ar/common.json";
import pt from "./locales/pt/common.json";
import hi from "./locales/hi/common.json";

import { applyDir, getLanguage, SUPPORTED_CODES } from "./languages";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en:        { common: en },
      es:        { common: es },
      vi:        { common: vi },
      "zh-Hans": { common: zhHans },
      "zh-Hant": { common: zhHant },
      fil:       { common: fil },
      ko:        { common: ko },
      ar:        { common: ar },
      pt:        { common: pt },
      hi:        { common: hi },
    },
    defaultNS: "common",
    fallbackLng: "en",
    supportedLngs: SUPPORTED_CODES,
    detection: {
      order: ["querystring", "localStorage", "navigator"],
      lookupQuerystring: "lang",
      lookupLocalStorage: "sweepr_lang",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

// Sync dir attribute whenever language changes.
i18n.on("languageChanged", (code) => {
  applyDir(getLanguage(code));
});

// Apply on initial load.
applyDir(getLanguage(i18n.language));

// IP-based FIRST-VISIT default: only when the visitor has no last-used
// language (localStorage) and no explicit ?lang link. Last-used always wins
// on every later visit — this never overrides a choice the user has made.
const hasLastUsed = (() => {
  try { return !!localStorage.getItem("sweepr_lang"); } catch { return false; }
})();
const hasLangParam = new URLSearchParams(window.location.search).has("lang");
if (!hasLastUsed && !hasLangParam) {
  const api = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";
  fetch(`${api}/locale/suggest`)
    .then((r) => (r.ok ? (r.json() as Promise<{ lang?: string }>) : null))
    .then((d) => {
      if (d?.lang && SUPPORTED_CODES.includes(d.lang) && d.lang !== i18n.language) {
        // changeLanguage writes localStorage via the detector cache, so the
        // suggestion immediately becomes the visitor's last-used language.
        void i18n.changeLanguage(d.lang);
      }
    })
    .catch(() => { /* fall back to navigator/en */ });
}

export default i18n;
export { SUPPORTED_CODES };
