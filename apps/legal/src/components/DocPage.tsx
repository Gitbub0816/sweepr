/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Printer, FileDown, FileText } from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api.getsweepr.com";

interface ArchivedVersion {
  version: { version: string; attorneyName?: string | null; attorney_approved_at?: string | null };
  documentUrl: string;
  pdfUrl: string;
}

// Slugs that actually have a published archived version, fetched once per
// page load via the batched list endpoint so individual doc pages never fire
// /current requests that are guaranteed to 404 for unpublished docs.
let archivedSlugsPromise: Promise<Set<string>> | null = null;
function fetchArchivedSlugs(): Promise<Set<string>> {
  archivedSlugsPromise ??= fetch(`${API_URL}/legal-archive`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d: { docs: { slug: string }[] }) => new Set(d.docs.map((doc) => doc.slug)))
    .catch(() => {
      archivedSlugsPromise = null; // allow retry on next navigation
      return new Set<string>();
    });
  return archivedSlugsPromise;
}
import { LAST_UPDATED, LEGAL_EMAIL, LEGAL_URL } from "../docs";
import { TableOfContents, type TocItem } from "./TableOfContents";

function setMetaTag(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(url: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", url);
}

function setJsonLd(id: string, data: unknown) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.id = id;
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export interface DocMetaProps {
  /** Document version, e.g. "1.0". */
  version?: string;
  /** Effective date string, e.g. "June 2026". */
  effectiveDate?: string;
  /** Owner/contact email for this document. Defaults to legal@. */
  owner?: string;
}

export function DocPage({
  title,
  intro,
  toc,
  version,
  effectiveDate,
  owner = LEGAL_EMAIL,
  children,
}: {
  title: string;
  intro?: string;
  toc: TocItem[];
  children: ReactNode;
} & DocMetaProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [archived, setArchived] = useState<ArchivedVersion | null>(null);

  useEffect(() => {
    document.title = `${title}, Sweepr Legal`;
    const slug = window.location.pathname.replace(/^\//, "");
    const url = `${LEGAL_URL}/${slug}`;
    const description = intro ?? `${title}, one of Sweepr's official legal documents.`;
    setMetaTag("name", "description", description);
    setMetaTag("property", "og:title", `${title}, Sweepr Legal`);
    setMetaTag("property", "og:description", description);
    setMetaTag("property", "og:url", url);
    setCanonical(url);
    setJsonLd("doc-jsonld", {
      "@context": "https://schema.org",
      "@type": "DigitalDocument",
      name: title,
      url,
      description,
      version,
      dateModified: effectiveDate ?? LAST_UPDATED,
      publisher: { "@type": "Organization", name: "Sweepr", url: "https://getsweepr.com/" },
    });
    // Move focus to the page heading on route change so keyboard/screen
    // reader users land on new content instead of staying on stale focus.
    headingRef.current?.focus();

    // Offer downloads if a versioned snapshot has been archived for this doc.
    setArchived(null);
    let cancelled = false;
    fetchArchivedSlugs()
      .then((slugs) => {
        if (cancelled || !slugs.has(slug)) return null;
        return fetch(`${API_URL}/legal-archive/${slug}/current`).then((r) =>
          r.ok ? (r.json() as Promise<ArchivedVersion>) : null,
        );
      })
      .then((d) => {
        if (!cancelled && d) setArchived(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [title, intro, version, effectiveDate]);

  return (
    <div className="legal-doc sweepr-fade-up flex flex-col gap-10 lg:flex-row">
      <article className="min-w-0 flex-1">
        <header className="border-b border-slate-200 pb-6">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-bold text-charcoal outline-none"
          >
            {title}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>Effective: {effectiveDate ?? LAST_UPDATED}</span>
            <span>Last updated: {LAST_UPDATED}</span>
            {version && <span>Version: {version}</span>}
            <span>
              Owner:{" "}
              <a className="text-seafoam-700 underline" href={`mailto:${owner}`}>
                {owner}
              </a>
            </span>
          </div>
          {intro && (
            <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
              {intro}
            </p>
          )}
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
            {archived && (
              <>
                <a
                  href={archived.pdfUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <FileDown className="h-4 w-4" /> Download PDF
                </a>
                <a
                  href={archived.documentUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <FileText className="h-4 w-4" /> Download HTML
                </a>
              </>
            )}
          </div>
        </header>
        <div className="divide-y divide-slate-100">{children}</div>
      </article>

      <div className="hidden w-56 shrink-0 lg:block">
        <TableOfContents items={toc} />
      </div>
    </div>
  );
}
