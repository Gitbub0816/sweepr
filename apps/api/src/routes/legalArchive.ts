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
 * Legal document archive — versioned snapshots (document.html, document.pdf,
 * metadata.json) of legal.getsweepr.com pages stored in the sweepr-legal R2
 * bucket. Admin publishes a version by uploading the two files; public
 * routes list versions and redirect to the current one's R2 objects.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminRoles";
import { audit } from "../lib/audit";
import { parseR2LegalConfig } from "../lib/r2";
import {
  publishLegalDocVersion,
  listLegalDocVersions,
  getCurrentLegalDocVersion,
  listAllCurrentLegalDocs,
} from "../lib/legalArchive";
import type { AppBindings } from "../types";

export const legalArchiveRouter = new Hono<AppBindings>();

// --- Public ---

legalArchiveRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const docs = await listAllCurrentLegalDocs(sql);
  return c.json({ docs });
});

legalArchiveRouter.get("/:slug/versions", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const versions = await listLegalDocVersions(sql, c.req.param("slug"));
  return c.json({ versions });
});

legalArchiveRouter.get("/:slug/current", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const current = await getCurrentLegalDocVersion(sql, c.req.param("slug"));
  if (!current) return c.json({ error: "No archived version for this document" }, 404);
  const r2 = parseR2LegalConfig(c.env);
  return c.json({
    version: current,
    documentUrl: `${r2.publicUrlBase}/${current.r2Prefix}/document.html`,
    pdfUrl: `${r2.publicUrlBase}/${current.r2Prefix}/document.pdf`,
    metadataUrl: `${r2.publicUrlBase}/${current.r2Prefix}/metadata.json`,
  });
});

// --- Admin ---

const adminLegalArchiveRouter = new Hono<AppBindings>();
adminLegalArchiveRouter.use("*", requireAuth, requireAdmin);

const publishSchema = z.object({
  slug: z.string().trim().min(1),
  version: z.string().trim().min(1),
  title: z.string().trim().min(1),
  category: z.string().trim().min(1),
  effectiveDate: z.string().trim().min(1),
});

adminLegalArchiveRouter.post("/publish", async (c) => {
  const form = await c.req.formData();
  const parsed = publishSchema.safeParse({
    slug: form.get("slug"),
    version: form.get("version"),
    title: form.get("title"),
    category: form.get("category"),
    effectiveDate: form.get("effectiveDate"),
  });
  if (!parsed.success) return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);

  const htmlFile = form.get("html");
  const pdfFile = form.get("pdf");
  const isFileLike = (v: unknown): v is { text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> } =>
    typeof v === "object" && v !== null && "arrayBuffer" in v && "text" in v;
  if (!isFileLike(htmlFile) || !isFileLike(pdfFile)) {
    return c.json({ error: "html and pdf files are required" }, 400);
  }

  const sql = getDb(c.env.DATABASE_URL);
  const r2 = parseR2LegalConfig(c.env);
  const user = c.get("user");

  const version = await publishLegalDocVersion(sql, r2, {
    ...parsed.data,
    html: await htmlFile.text(),
    pdf: await pdfFile.arrayBuffer(),
    publishedByClerkId: user.clerkId,
  });

  await audit(sql, {
    action: "admin.action",
    actorClerkId: user.clerkId,
    targetType: "legal_document_version",
    targetId: `${version.slug}@${version.version}`,
    metadata: { slug: version.slug, version: version.version },
    timestamp: new Date().toISOString(),
  });

  return c.json({ version });
});

legalArchiveRouter.route("/admin", adminLegalArchiveRouter);
