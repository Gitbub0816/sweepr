/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { docsByCategory } from "../docs";
import { Reveal } from "../components/Reveal";

export function HomePage() {
  const groups = docsByCategory();

  return (
    <div>
      <header className="sweepr-fade-up border-b border-slate-200 pb-8">
        <h1 className="text-3xl font-bold text-charcoal">Legal Documents</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          Everything that governs your relationship with Sweepr, our terms,
          your privacy rights, cleaner agreements, payments, safety, and more.
          We keep these documents clear and current. If you have questions,
          contact our support team.
        </p>
      </header>

      {groups.map((group, i) => (
        <Reveal key={group.category} delayMs={Math.min(i, 3) * 40} className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {group.category}
          </h2>
          <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
            {group.docs.map((doc) => (
              <Link
                key={doc.slug}
                to={`/${doc.slug}`}
                className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-seafoam-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-seafoam-600"
              >
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-charcoal">{doc.title}</h3>
                  <p className="mt-0.5 truncate text-sm text-slate-500">{doc.description}</p>
                </div>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-seafoam-700"
                />
              </Link>
            ))}
          </div>
        </Reveal>
      ))}
    </div>
  );
}
