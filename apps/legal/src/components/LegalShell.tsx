import type { ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { COMPANY_NAME, DOCS, LAST_UPDATED, docsByCategory } from "../docs";
import { LegalLogo } from "./LegalLogo";

const REF_URLS: Record<string, { label: string; url: string }> = {
  marketing: { label: "getsweepr.com", url: "https://getsweepr.com" },
  customer:  { label: "Sweepr App", url: "https://app.getsweepr.com" },
  cleaner:   { label: "Sweepr Pro", url: "https://clean.getsweepr.com" },
  admin:     { label: "Admin", url: "https://admin.getsweepr.com" },
};

export function LegalShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const ref = searchParams.get("ref") ?? "marketing";
  const back = REF_URLS[ref] ?? REF_URLS.marketing;

  return (
    <div className="flex min-h-full flex-col bg-white">
      {/* Top nav */}
      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-baseline gap-2">
            <LegalLogo size="md" />
            <span className="text-sm text-slate-400">Legal</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-slate-400 sm:inline">
              Legal Documents
            </span>
            <a
              href={back.url}
              className="font-medium text-seafoam-600 hover:text-seafoam-700"
            >
              ← Back to {back.label}
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 md:flex-row md:gap-8 md:py-8">
        {/* Left sidebar: all docs */}
        <aside className="no-print hidden w-56 shrink-0 md:block">
          <div className="sticky top-24">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Documents
            </p>
            <nav className="max-h-[calc(100vh-9rem)] space-y-4 overflow-y-auto pr-1">
              {docsByCategory().map((group) => (
                <div key={group.category}>
                  <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                    {group.category}
                  </p>
                  {group.docs.map((doc) => {
                    const active = pathname === `/${doc.slug}`;
                    return (
                      <Link
                        key={doc.slug}
                        to={`/${doc.slug}`}
                        className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                          active
                            ? "bg-seafoam-50 font-medium text-seafoam-700"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {doc.title}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Mobile doc selector */}
        <div className="no-print mb-4 w-full md:hidden">
          <select
            value={pathname}
            onChange={(e) => {
              window.location.href = e.target.value;
            }}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="/">All documents</option>
            {DOCS.map((doc) => (
              <option key={doc.slug} value={`/${doc.slug}`}>
                {doc.title}
              </option>
            ))}
          </select>
        </div>

        <main className="legal-content min-w-0 flex-1">{children}</main>
      </div>

      {/* Footer */}
      <footer className="no-print border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {DOCS.map((doc) => (
              <Link
                key={doc.slug}
                to={`/${doc.slug}`}
                className="text-slate-500 hover:text-seafoam-700"
              >
                {doc.title}
              </Link>
            ))}
          </div>
          <p className="mt-6 text-xs text-slate-400">
            © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
            Last updated: {LAST_UPDATED}.
          </p>
        </div>
      </footer>
    </div>
  );
}
