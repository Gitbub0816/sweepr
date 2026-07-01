import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "./languages";

interface Props {
  className?: string;
}

export function LanguageSelector({ className }: Props) {
  const { i18n, t } = useTranslation();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value;
    void i18n.changeLanguage(code);
    // Update URL so nav links carry the language without a page reload
    const url = new URL(window.location.href);
    if (code === "en") {
      url.searchParams.delete("lang");
    } else {
      url.searchParams.set("lang", code);
    }
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <div className={className}>
      <label className="sr-only" htmlFor="lang-select-marketing">
        {t("languageSelector.label")}
      </label>
      <select
        id="lang-select-marketing"
        value={i18n.language}
        onChange={handleChange}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-seafoam-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
}
