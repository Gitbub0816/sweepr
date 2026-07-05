import { useEffect, useState, useCallback } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@sweepr/utils";

const STORAGE_KEY = "theme";

export type Theme = "light" | "dark";

function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme(): {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>("light");

  // Apply immediately on mount to avoid a flash of the wrong theme.
  useEffect(() => {
    const initial = resolveInitialTheme();
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggle, setTheme };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 focus-visible:ring-offset-2 dark:text-slate-400 dark:hover:bg-slate-800",
        className
      )}
    >
      {/* Crossfading icon pair via plain CSS transitions instead of
          framer-motion's AnimatePresence — this component is used from
          eagerly-rendered shell chrome across every app, so pulling in
          framer-motion here forced it into the initial bundle everywhere. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute transition-all duration-200 ease-out motion-reduce:transition-none",
          isDark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0",
        )}
      >
        <Sun className="h-4 w-4" />
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "absolute transition-all duration-200 ease-out motion-reduce:transition-none",
          isDark ? "-rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100",
        )}
      >
        <Moon className="h-4 w-4" />
      </span>
    </button>
  );
}
