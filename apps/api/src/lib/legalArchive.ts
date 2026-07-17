/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Versioned archive of legal.getsweepr.com documents: static snapshots
 * (document.html, document.pdf, metadata.json) stored in the sweepr-legal
 * R2 bucket under legal/<slug>/v<version>/ — separate from the general
 * media bucket. The live legal app keeps rendering from React; this is the
 * archival/audit trail plus a stable, versioned URL for each document as it
 * looked at a point in time.
 */

import type { Sql } from "./db";
import { putObjectR2, r2PublicUrl, type R2Config } from "./r2";

export interface LegalDocVersion {
  id: string;
  slug: string;
  version: string;
  title: string;
  category: string;
  r2Prefix: string;
  isCurrent: boolean;
  publishedByClerkId: string | null;
  createdAt: string;
}

interface LegalDocVersionRow {
  id: string;
  slug: string;
  version: string;
  title: string;
  category: string;
  r2_prefix: string;
  is_current: boolean;
  published_by_clerk_id: string | null;
  created_at: string;
}

function toLegalDocVersion(r: LegalDocVersionRow): LegalDocVersion {
  return {
    id: r.id,
    slug: r.slug,
    version: r.version,
    title: r.title,
    category: r.category,
    r2Prefix: r.r2_prefix,
    isCurrent: r.is_current,
    publishedByClerkId: r.published_by_clerk_id,
    createdAt: r.created_at,
  };
}

export function legalArchiveR2Prefix(slug: string, version: string): string {
  return `legal/${slug}/v${version}`;
}

/** Uploads document.html + document.pdf + metadata.json for one doc version
 *  and records it in the DB, flipping any prior version's is_current off. */
export async function publishLegalDocVersion(
  sql: Sql,
  r2: R2Config,
  input: {
    slug: string;
    version: string;
    title: string;
    category: string;
    html: string;
    pdf: ArrayBuffer;
    effectiveDate: string;
    publishedByClerkId: string | null;
  },
): Promise<LegalDocVersion> {
  const prefix = legalArchiveR2Prefix(input.slug, input.version);
  const metadata = {
    slug: input.slug,
    version: input.version,
    title: input.title,
    category: input.category,
    effectiveDate: input.effectiveDate,
    publishedAt: new Date().toISOString(),
    documentUrl: r2PublicUrl(r2, `${prefix}/document.html`),
    pdfUrl: r2PublicUrl(r2, `${prefix}/document.pdf`),
  };

  await putObjectR2(r2, `${prefix}/document.html`, input.html, "text/html; charset=utf-8");
  await putObjectR2(r2, `${prefix}/document.pdf`, input.pdf, "application/pdf");
  await putObjectR2(r2, `${prefix}/metadata.json`, JSON.stringify(metadata, null, 2), "application/json");

  await sql`
    UPDATE legal_document_versions SET is_current = FALSE
    WHERE slug = ${input.slug} AND is_current = TRUE
  `;
  const rows = (await sql`
    INSERT INTO legal_document_versions (slug, version, title, category, r2_prefix, is_current, published_by_clerk_id)
    VALUES (${input.slug}, ${input.version}, ${input.title}, ${input.category}, ${prefix}, TRUE, ${input.publishedByClerkId})
    ON CONFLICT (slug, version) DO UPDATE SET
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      is_current = TRUE,
      published_by_clerk_id = EXCLUDED.published_by_clerk_id
    RETURNING id, slug, version, title, category, r2_prefix, is_current, published_by_clerk_id, created_at
  `) as LegalDocVersionRow[];
  return toLegalDocVersion(rows[0]);
}

export async function listLegalDocVersions(sql: Sql, slug: string): Promise<LegalDocVersion[]> {
  const rows = (await sql`
    SELECT id, slug, version, title, category, r2_prefix, is_current, published_by_clerk_id, created_at
    FROM legal_document_versions WHERE slug = ${slug} ORDER BY created_at DESC
  `) as LegalDocVersionRow[];
  return rows.map(toLegalDocVersion);
}

export async function getCurrentLegalDocVersion(sql: Sql, slug: string): Promise<LegalDocVersion | null> {
  const rows = (await sql`
    SELECT id, slug, version, title, category, r2_prefix, is_current, published_by_clerk_id, created_at
    FROM legal_document_versions WHERE slug = ${slug} AND is_current = TRUE LIMIT 1
  `) as LegalDocVersionRow[];
  return rows[0] ? toLegalDocVersion(rows[0]) : null;
}

export async function listAllCurrentLegalDocs(sql: Sql): Promise<LegalDocVersion[]> {
  const rows = (await sql`
    SELECT id, slug, version, title, category, r2_prefix, is_current, published_by_clerk_id, created_at
    FROM legal_document_versions WHERE is_current = TRUE ORDER BY slug ASC
  `) as LegalDocVersionRow[];
  return rows.map(toLegalDocVersion);
}
