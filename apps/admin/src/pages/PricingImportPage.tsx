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
 * Pricing Import — the ONLY bridge from the MCP pricing sandbox to live
 * pricing, and it is a human one. An admin pastes (or uploads) an
 * LLM-drafted PricingConfigV2 payload here; the page creates a DRAFT
 * pricing version via the same /admin/pricing-v2 endpoints Pricing Studio
 * uses. This page can NEVER publish: review and publication happen in
 * Pricing Studio, by a human, after inspecting the draft.
 *
 * Accepted payloads:
 *  - a bare PricingConfigV2 object, or
 *  - a wrapper { name?, note?, config: {...} } (detected by a `config` key).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { AlertTriangle, CheckCircle2, FileUp, FlaskConical, Rocket, Upload } from "lucide-react";
import { Button, Card, toast } from "@sweepr/ui";
import { Link } from "react-router-dom";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

/** Payloads above this are rejected client-side before any network call. */
const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1 MB

/** Small typical-home input used to smoke-test a config server-side. */
const SMOKE_TEST_INPUT = {
  serviceArea: "default",
  currency: "USD",
  counts: { kitchen: 1, bathroom: 2, bedroom: 3, living_room: 1 },
  conditions: { kitchen: 2, bathroom: 2, bedroom: 2, living_room: 2 },
  extras: [],
};

interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

interface ParsedPayload {
  config: Record<string, unknown>;
  name?: string;
  note?: string;
}

function useApi() {
  const { getToken } = useAuth();
  return useCallback(
    async (path: string, init: RequestInit = {}) => {
      const token = await getToken();
      return fetch(`${API}/admin/pricing-v2/${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    },
    [getToken],
  );
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parse the pasted text into a config + optional name/note, or throw with a
 *  human-readable message. */
function parsePayload(raw: string): ParsedPayload {
  const bytes = new TextEncoder().encode(raw).length;
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new Error(
      `Payload is ${(bytes / 1024).toFixed(0)} KB, above the 1 MB limit. A pricing config should be far smaller; check that the right thing was pasted.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Not valid JSON: ${err instanceof Error ? err.message : String(err)}. Paste the exact payload the MCP tool produced.`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object (a PricingConfigV2, or a wrapper with a `config` key).");
  }
  const obj = parsed as Record<string, unknown>;
  if ("config" in obj) {
    const config = obj.config;
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("The wrapper's `config` value must be a JSON object (the PricingConfigV2).");
    }
    return {
      config: config as Record<string, unknown>,
      name: typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : undefined,
      note: typeof obj.note === "string" && obj.note.trim() ? obj.note.trim() : undefined,
    };
  }
  return { config: obj };
}

function ValidationPanel({ validation }: { validation: Validation }) {
  return (
    <div className="space-y-2">
      {validation.ok && validation.warnings.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Config passed server-side validation with no warnings.
        </div>
      )}
      {validation.errors.length > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
          <p className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {validation.errors.length} validation error{validation.errors.length === 1 ? "" : "s"}
          </p>
          <ul className="list-disc space-y-0.5 pl-6">
            {validation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {validation.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <p className="mb-1 font-semibold">
            {validation.warnings.length} warning{validation.warnings.length === 1 ? "" : "s"}
          </p>
          <ul className="list-disc space-y-0.5 pl-6">
            {validation.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function PricingImportPage() {
  const api = useApi();
  const fileInput = useRef<HTMLInputElement>(null);

  const [raw, setRaw] = useState("");
  const [name, setName] = useState(`MCP import ${todayStamp()}`);
  const [parseError, setParseError] = useState<string | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [smokeTotal, setSmokeTotal] = useState<number | null>(null);
  const [validating, setValidating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const byteSize = useMemo(() => new TextEncoder().encode(raw).length, [raw]);

  function resetResults() {
    setParseError(null);
    setValidation(null);
    setSmokeTotal(null);
    setCreatedId(null);
  }

  function tryParse(): ParsedPayload | null {
    try {
      const payload = parsePayload(raw);
      setParseError(null);
      return payload;
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      setValidation(null);
      setSmokeTotal(null);
      return null;
    }
  }

  async function onFile(file: File) {
    if (file.size > MAX_PAYLOAD_BYTES) {
      toast.error(`File is ${(file.size / 1024).toFixed(0)} KB, above the 1 MB limit.`);
      return;
    }
    const text = await file.text();
    setRaw(text);
    resetResults();
    // Prefill the draft name from the wrapper (or the file name) if the admin
    // has not customized it.
    try {
      const payload = parsePayload(text);
      if (payload.name) setName(payload.name);
    } catch {
      // Parse errors surface when the admin validates; do not block the load.
    }
  }

  async function validate() {
    const payload = tryParse();
    if (!payload) return;
    setValidating(true);
    setValidation(null);
    setSmokeTotal(null);
    try {
      const res = await api("preview", {
        method: "POST",
        body: JSON.stringify({ config: payload.config, input: SMOKE_TEST_INPUT }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            result?: { money?: { totalCents?: number }; totalCents?: number };
            validation?: Validation;
            error?: string;
            message?: string;
          }
        | null;
      if (!res.ok) {
        if (data?.validation) {
          setValidation({ ok: false, errors: data.validation.errors ?? [], warnings: data.validation.warnings ?? [] });
        } else {
          toast.error(data?.message ?? data?.error ?? "Validation request failed");
        }
        return;
      }
      setValidation({ ok: true, errors: [], warnings: [] });
      const total = data?.result?.money?.totalCents ?? data?.result?.totalCents;
      if (typeof total === "number") setSmokeTotal(total);
      toast.success("Config passed the server-side smoke test.");
    } finally {
      setValidating(false);
    }
  }

  async function createDraft() {
    const payload = tryParse();
    if (!payload) return;
    const draftName = (payload.name ?? name).trim();
    if (!draftName) {
      toast.error("Give the draft a name first.");
      return;
    }
    setCreating(true);
    setCreatedId(null);
    try {
      // 1) Create an empty draft version.
      const createRes = await api("versions", {
        method: "POST",
        body: JSON.stringify({ name: draftName }),
      });
      const createData = (await createRes.json().catch(() => null)) as
        | { version?: { id: string }; error?: string; message?: string }
        | null;
      if (!createRes.ok || !createData?.version?.id) {
        toast.error(createData?.message ?? createData?.error ?? "Could not create the draft version");
        return;
      }
      const id = createData.version.id;

      // 2) Replace its whole config with the imported payload. The server
      //    re-runs validatePricingConfig and returns the result.
      const note = payload.note ?? "Imported from MCP pricing sandbox payload";
      const putRes = await api(`versions/${id}/config`, {
        method: "PUT",
        body: JSON.stringify({ config: payload.config, note }),
      });
      const putData = (await putRes.json().catch(() => null)) as
        | { validation?: Validation; error?: string; message?: string }
        | null;
      if (!putRes.ok) {
        toast.error(putData?.message ?? putData?.error ?? "Could not apply the config to the draft");
        return;
      }
      if (putData?.validation) {
        setValidation({
          ok: putData.validation.ok,
          errors: putData.validation.errors ?? [],
          warnings: putData.validation.warnings ?? [],
        });
      }
      setCreatedId(id);
      if (putData?.validation && !putData.validation.ok) {
        toast.error(
          `Draft created, but it has ${putData.validation.errors.length} validation error(s). Fix them in Pricing Studio before publishing.`,
        );
      } else {
        toast.success("Draft created. Customers are unaffected until it is published in Pricing Studio.");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-charcoal dark:text-white">Import Payload</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Paste an MCP-drafted Pricing v2 payload to create a DRAFT pricing version. This page never
          publishes: review and publication happen in Pricing Studio, after a human checks the numbers.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        Accepted formats: a bare PricingConfigV2 object, or a wrapper{" "}
        <code className="rounded bg-slate-200 px-1 py-0.5 text-xs dark:bg-slate-700">
          {"{ name?, note?, config: {...} }"}
        </code>
        . Customers are unaffected by anything on this page.
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-charcoal dark:text-white">Payload</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-slate-400">
              {byteSize > 0 ? `${(byteSize / 1024).toFixed(1)} KB` : ""}
              {byteSize > MAX_PAYLOAD_BYTES && <span className="ml-1 font-medium text-rose-600">over the 1 MB limit</span>}
            </span>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
              <FileUp className="mr-1 h-3.5 w-3.5" /> Load .json file
            </Button>
          </div>
        </div>
        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            resetResults();
          }}
          spellCheck={false}
          rows={14}
          placeholder='{"laborMatrix": { ... }, "rates": { ... }, ...}   or   {"name": "...", "note": "...", "config": { ... }}'
          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-charcoal placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Draft name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="w-72 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <span className="mt-1 block text-xs text-slate-400">
              A `name` inside the payload wrapper takes precedence.
            </span>
          </label>
          <div className="flex gap-2 pb-5">
            <Button size="sm" variant="secondary" loading={validating} disabled={!raw.trim() || creating} onClick={() => void validate()}>
              <FlaskConical className="mr-1 h-3.5 w-3.5" /> Validate
            </Button>
            <Button size="sm" loading={creating} disabled={!raw.trim() || validating} onClick={() => void createDraft()}>
              <Upload className="mr-1 h-3.5 w-3.5" /> Create draft
            </Button>
          </div>
        </div>
      </Card>

      {parseError && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Could not read the payload
          </p>
          <p className="mt-1">{parseError}</p>
        </div>
      )}

      {validation && <ValidationPanel validation={validation} />}

      {smokeTotal !== null && (
        <Card>
          <p className="text-sm text-slate-500">Smoke test (1 kitchen, 2 bathrooms, 3 bedrooms, 1 living area, everyday mess)</p>
          <p className="mt-1 text-2xl font-bold text-charcoal dark:text-white">${(smokeTotal / 100).toFixed(2)}</p>
          <p className="text-xs text-slate-500">Computed server-side by the production engine. Nothing was saved.</p>
        </Card>
      )}

      {createdId && (
        <Card className="border-emerald-300 dark:border-emerald-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4" /> Draft created
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Open Pricing Studio to review every number, run the test scenarios, and publish when
                approved. Publishing is deliberately not possible from this page.
              </p>
            </div>
            <Link to="/pricing-studio">
              <Button size="sm">
                <Rocket className="mr-1 h-3.5 w-3.5" /> Review in Pricing Studio
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
