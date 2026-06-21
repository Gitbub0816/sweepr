import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@sweepr/utils";

export interface MobileNavLink {
  label: string;
  href: string;
}

export interface MobileNavProps {
  links: MobileNavLink[];
  /** Optional footer slot, e.g. auth buttons. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Accessible hamburger menu with a full-screen slide-in drawer.
 * Animated 3-line -> X icon, focus trap, closes on outside click / link tap.
 */
export function MobileNav({ links, footer, className }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the panel for the trap.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 focus-visible:ring-offset-2 dark:text-white"
      >
        <span className="sr-only">Menu</span>
        <span className="flex flex-col gap-1.5">
          <span className="block h-0.5 w-6 rounded-full bg-current" />
          <span className="block h-0.5 w-6 rounded-full bg-current" />
          <span className="block h-0.5 w-6 rounded-full bg-current" />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-white p-6 outline-none dark:bg-slate-900"
            >
              <div className="mb-8 flex items-center justify-between">
                <span className="text-lg font-bold text-charcoal dark:text-white">
                  Menu
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 dark:text-white"
                >
                  <span className="absolute block h-0.5 w-6 rotate-45 rounded-full bg-current" />
                  <span className="absolute block h-0.5 w-6 -rotate-45 rounded-full bg-current" />
                </button>
              </div>
              <nav className="flex flex-col gap-1">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-xl px-3 py-3 text-base font-medium text-charcoal transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seafoam-500 dark:text-white dark:hover:bg-slate-800"
                    )}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
              {footer && <div className="mt-auto pt-6">{footer}</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
