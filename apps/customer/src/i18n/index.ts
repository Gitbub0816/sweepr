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

export default i18n;
export { SUPPORTED_CODES };
