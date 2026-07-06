import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "./languages";

interface Props {
  className?: string;
}

export function LanguageSelector({ className }: Props) {
  const { i18n, t } = useTranslation();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    // Changing the language fires i18n's "languageChanged" event, which the
    // LanguagePersistence component (App.tsx) persists to the profile using a
    // proper Clerk session token. No direct fetch here — the old one used
    // __clerk_db_jwt, which isn't a verifiable session JWT and always 401'd.
    void i18n.changeLanguage(e.target.value);
  }

  return (
    <div className={className}>
      <label className="sr-only" htmlFor="lang-select">
        {t("languageSelector.label")}
      </label>
      <select
        id="lang-select"
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
