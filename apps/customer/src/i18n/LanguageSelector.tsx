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
    // Best-effort: persist to user profile via API (fire-and-forget).
    // The bearer token may not be available here, so we read from Clerk indirectly.
    const token = localStorage.getItem("__clerk_db_jwt");
    if (token) {
      const api = import.meta.env.VITE_API_URL ?? "";
      fetch(`${api}/customer-profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ preferredLanguage: code }),
      }).catch(() => null);
    }
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
