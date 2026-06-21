import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Printer } from "lucide-react";
import { LAST_UPDATED } from "../docs";
import { TableOfContents, type TocItem } from "./TableOfContents";

export function DocPage({
  title,
  intro,
  toc,
  children,
}: {
  title: string;
  intro?: string;
  toc: TocItem[];
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex gap-10"
    >
      <article className="min-w-0 flex-1">
        <header className="border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-bold text-charcoal">{title}</h1>
          <p className="mt-2 text-sm text-slate-400">
            Last updated: {LAST_UPDATED}
          </p>
          {intro && (
            <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
              {intro}
            </p>
          )}
          <button
            onClick={() => window.print()}
            className="no-print mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </header>
        <div className="divide-y divide-slate-100">{children}</div>
      </article>

      <div className="w-56 shrink-0">
        <TableOfContents items={toc} />
      </div>
    </motion.div>
  );
}
