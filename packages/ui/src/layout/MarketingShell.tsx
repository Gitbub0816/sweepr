import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@sweepr/utils";

export interface MarketingNavLink {
  label: string;
  href: string;
}

export function MarketingShell({
  navLinks,
  cta,
  children,
}: {
  navLinks: MarketingNavLink[];
  cta?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-offwhite text-charcoal dark:bg-slate-950 dark:text-white">
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/70 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <a href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-seafoam-500 font-bold text-white">
              S
            </div>
            <span className="text-lg font-bold">Sweepr</span>
          </a>
          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-seafoam-600 dark:text-slate-300"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="hidden md:block">{cta}</div>
          <button
            className="md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950 md:hidden">
            <nav className="flex flex-col gap-3">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "text-sm font-medium text-slate-600 dark:text-slate-300"
                  )}
                >
                  {l.label}
                </a>
              ))}
              <div className="pt-2">{cta}</div>
            </nav>
          </div>
        )}
      </header>
      {children}
    </div>
  );
}
