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
import { motion, useReducedMotion } from "framer-motion";
import { Printer, AlertTriangle, FileDown, FileText } from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api.getsweepr.com";

interface ArchivedVersion {
  version: { version: string; attorneyName?: string | null; attorney_approved_at?: string | null };
  documentUrl: string;
  pdfUrl: string;
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
  /**
   * When true, renders a prominent banner noting the document is a draft and
   * requires attorney review before production use. Defaults to true for all
   * documents generated from the legal audit until counsel signs off.
   */
  draft?: boolean;
}

export function DocPage({
  title,
  intro,
  toc,
  version,
  effectiveDate,
  owner = LEGAL_EMAIL,
  draft = true,
  children,
}: {
  title: string;
  intro?: string;
  toc: TocItem[];
  children: ReactNode;
} & DocMetaProps) {
  const prefersReducedMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [archived, setArchived] = useState<ArchivedVersion | null>(null);

  useEffect(() => {
    document.title = `${title}, Sweepr Legal`;
    const slug = window.location.pathname.replace(/^\//, "");
    const url = `${LEGAL_URL}/${slug}`;
    const description = intro ?? `${title} — Sweepr's official legal document.`;
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
    fetch(`${API_URL}/legal-archive/${slug}/current`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ArchivedVersion) => {
        if (!cancelled) setArchived(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [title, intro, version, effectiveDate]);

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
      className="legal-doc flex flex-col gap-10 lg:flex-row"
    >
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
          {draft && (
            <div className="no-print mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Draft, attorney review required.</strong> This document
                is a working draft prepared for internal development. It is not
                legal advice and must be reviewed and approved by qualified
                counsel before production use.
              </span>
            </div>
          )}
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
    </motion.div>
  );
}
