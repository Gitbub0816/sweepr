import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Menu, X, type LucideIcon } from "lucide-react";
import { cn } from "@sweepr/utils";
import { ThemeToggle } from "./ThemeToggle";
import { SweeprLogo } from "../assets/SweeprLogo";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface AppShellProps {
  brand: string;
  nav: NavItem[];
  children: ReactNode;
  headerRight?: ReactNode;
  accent?: string;
}

export function AppShell({
  brand,
  nav,
  children,
  headerRight,
}: AppShellProps) {
  const [open, setOpen] = useState(false);

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="leading-tight">
          <SweeprLogo size="sm" />
          <p className="mt-0.5 text-[11px] text-slate-400">{brand}</p>
        </div>
      </div>
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-seafoam-50 text-seafoam-700 dark:bg-seafoam-900/30 dark:text-seafoam-300"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-offwhite dark:bg-slate-950">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-seafoam-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-60 bg-white dark:bg-slate-900">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <button
            className="lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {headerRight}
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
