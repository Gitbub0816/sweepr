import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, ArrowRight } from "lucide-react";
import { DOCS, LAST_UPDATED } from "../docs";

export function HomePage() {
  return (
    <div>
      <header className="border-b border-slate-200 pb-8">
        <h1 className="text-3xl font-bold text-charcoal">Legal Documents</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          Everything that governs your relationship with Sweepr — our terms,
          your privacy rights, contractor agreements, and more. We keep these
          documents clear and current. If you have questions, contact our
          support team.
        </p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {DOCS.map((doc, i) => (
          <motion.div
            key={doc.slug}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Link
              to={`/${doc.slug}`}
              className="group flex h-full flex-col rounded-2xl border border-slate-200 p-5 transition-all hover:border-seafoam-300 hover:shadow-md"
            >
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-seafoam-50 text-seafoam-600">
                <FileText className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-semibold text-charcoal">
                {doc.title}
              </h2>
              <p className="mt-1 flex-1 text-sm text-slate-500">
                {doc.description}
              </p>
              <span className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-400">Updated {LAST_UPDATED}</span>
                <span className="flex items-center gap-1 font-medium text-seafoam-600 group-hover:gap-2">
                  Read <ArrowRight className="h-4 w-4 transition-all" />
                </span>
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
