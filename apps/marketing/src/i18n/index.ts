import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import type { BackendModule } from "i18next";

import en from "./locales/en/common.json";

import { applyDir, getLanguage, SUPPORTED_CODES } from "./languages";

/**
 * Only English ships in the initial bundle — it's the fallback language and
 * covers the majority of visitors. The other 9 locale JSON files (~150KB
 * combined) are dynamically imported on demand via this tiny custom
 * backend, so they're separate chunks fetched only once a visitor is
 * actually detected as / switches to that language, instead of all being
 * bundled synchronously into the marketing entry chunk.
 */
const lazyLocales: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  es: () => import("./locales/es/common.json"),
  vi: () => import("./locales/vi/common.json"),
  "zh-Hans": () => import("./locales/zh-Hans/common.json"),
  "zh-Hant": () => import("./locales/zh-Hant/common.json"),
  fil: () => import("./locales/fil/common.json"),
  ko: () => import("./locales/ko/common.json"),
  ar: () => import("./locales/ar/common.json"),
  pt: () => import("./locales/pt/common.json"),
  hi: () => import("./locales/hi/common.json"),
};

const lazyBackend: BackendModule = {
  type: "backend",
  init() {
    /* no options needed */
  },
  read(language, _namespace, callback) {
    const loader = lazyLocales[language];
    if (!loader) {
      // English is preloaded via `resources` below, and unknown languages
      // fall back to it — nothing to fetch.
      callback(null, {});
      return;
    }
    loader()
      .then((mod) => callback(null, mod.default))
      .catch((err) => callback(err as Error, null));
  },
};

i18n
  .use(LanguageDetector)
  .use(lazyBackend)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
    },
    defaultNS: "common",
    fallbackLng: "en",
    supportedLngs: SUPPORTED_CODES,
    detection: {
      // Check URL ?lang= param first, then localStorage, then browser
      order: ["querystring", "localStorage", "navigator"],
      lookupQuerystring: "lang",
      lookupLocalStorage: "sweepr_lang",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

i18n.on("languageChanged", (code) => {
  applyDir(getLanguage(code));
});

applyDir(getLanguage(i18n.language));

export default i18n;
export { SUPPORTED_CODES };
