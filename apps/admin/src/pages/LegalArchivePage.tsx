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
 * Legal document archive — publishes versioned snapshots (document.html,
 * document.pdf, metadata.json) of legal.getsweepr.com pages to the
 * sweepr-legal R2 bucket under legal/<slug>/v<version>/. The live legal app
 * keeps rendering from React; this is the archival/audit trail plus a
 * stable, versioned URL for each document as it looked at a point in time.
 */
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Archive, UploadCloud, ExternalLink } from "lucide-react";
import { Card, Button, Input, toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface ArchivedDoc {
  slug: string;
  version: string;
  title: string;
  category: string;
  r2Prefix: string;
  createdAt: string;
}

export function LegalArchivePage() {
  const { getToken } = useAuth();
  const [docs, setDocs] = useState<ArchivedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [form, setForm] = useState({
    slug: "",
    version: "1.0.0",
    title: "",
    category: "Core",
    effectiveDate: "",
  });
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/legal-archive`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setDocs(data.docs ?? []);
    } catch {
      toast.error("Failed to load legal archive");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const publish = useCallback(async () => {
    if (!htmlFile || !pdfFile || !form.slug || !form.title || !form.effectiveDate) {
      toast.error("Slug, title, effective date, and both files are required");
      return;
    }
    setPublishing(form.slug);
    try {
      const token = await getToken();
      const body = new FormData();
      body.set("slug", form.slug);
      body.set("version", form.version);
      body.set("title", form.title);
      body.set("category", form.category);
      body.set("effectiveDate", form.effectiveDate);
      body.set("html", htmlFile);
      body.set("pdf", pdfFile);
      const res = await fetch(`${API}/legal-archive/admin/publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Published ${form.slug} v${form.version}`);
      setHtmlFile(null);
      setPdfFile(null);
      await load();
    } catch {
      toast.error("Publish failed");
    } finally {
      setPublishing(null);
    }
  }, [form, htmlFile, pdfFile, getToken, load]);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-seafoam-600" />
          <h2 className="text-lg font-semibold">Publish a document version</h2>
        </div>
        <p className="text-sm text-slate-500">
          Uploads document.html + document.pdf to the sweepr-legal R2 bucket at{" "}
          <code>legal/&lt;slug&gt;/v&lt;version&gt;/</code> and records it as the current version.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input placeholder="Slug (e.g. terms)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <Input placeholder="Version (e.g. 1.0.0)" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Input placeholder="Effective date (e.g. June 2026)" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <UploadCloud className="h-4 w-4" /> {htmlFile?.name ?? "Choose document.html"}
            <input type="file" accept=".html" className="hidden" onChange={(e) => setHtmlFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <UploadCloud className="h-4 w-4" /> {pdfFile?.name ?? "Choose document.pdf"}
            <input type="file" accept=".pdf" className="hidden" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <Button onClick={publish} disabled={publishing !== null} className="w-fit">
          {publishing ? "Publishing…" : "Publish version"}
        </Button>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold">Archived documents (current versions)</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-slate-500">No documents archived yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">Slug</th>
                <th>Title</th>
                <th>Category</th>
                <th>Version</th>
                <th>Published</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.slug} className="border-b border-slate-100">
                  <td className="py-2 font-mono text-xs">{d.slug}</td>
                  <td>{d.title}</td>
                  <td>{d.category}</td>
                  <td>{d.version}</td>
                  <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                  <td>
                    <a
                      className="inline-flex items-center gap-1 text-seafoam-700 underline"
                      href={`https://legalobjects.getsweepr.com/${d.r2Prefix}/document.html`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
