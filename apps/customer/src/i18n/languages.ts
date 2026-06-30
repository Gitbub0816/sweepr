export interface Language {
  code: string;
  name: string;   // native name
  dir: "ltr" | "rtl";
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en",      name: "English",    dir: "ltr" },
  { code: "es",      name: "Español",    dir: "ltr" },
  { code: "vi",      name: "Tiếng Việt", dir: "ltr" },
  { code: "zh-Hans", name: "简体中文",    dir: "ltr" },
  { code: "zh-Hant", name: "繁體中文",    dir: "ltr" },
  { code: "fil",     name: "Filipino",   dir: "ltr" },
  { code: "ko",      name: "한국어",      dir: "ltr" },
  { code: "ar",      name: "العربية",    dir: "rtl" },
  { code: "pt",      name: "Português",  dir: "ltr" },
  { code: "hi",      name: "हिन्दी",      dir: "ltr" },
];

export const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

export function getLanguage(code: string): Language {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? SUPPORTED_LANGUAGES[0];
}

export function applyDir(lang: Language) {
  document.documentElement.lang = lang.code;
  document.documentElement.dir = lang.dir;
}
