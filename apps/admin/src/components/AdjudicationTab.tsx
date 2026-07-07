import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Gavel, Plus, Trash2, Scale } from "lucide-react";
import { Card, Button, Badge, Select, Input, Textarea, Modal, TableSkeleton, EmptyState, toast } from "@sweepr/ui";
import { DataTable, type Column } from "./DataTable";

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

/** Mirrors OFFENSE_CATEGORIES in the API's adjudicationPolicy engine. */
const CATEGORIES = [
  { value: "permanent", label: "Permanent disqualifying (murder, kidnapping, sexual assault…)" },
  { value: "high_trust", label: "High trust crime (burglary, theft, fraud…)" },
  { value: "violent_felony", label: "Violent felony" },
  { value: "multiple_dui", label: "Multiple DUI" },
  { value: "dui", label: "DUI (single)" },
  { value: "drug_manufacturing", label: "Manufacturing controlled substances" },
  { value: "drug_distribution", label: "Drug distribution" },
  { value: "drug_possession", label: "Simple possession" },
  { value: "violent_misdemeanor", label: "Violent misdemeanor" },
  { value: "nonviolent_misdemeanor", label: "Nonviolent misdemeanor" },
];

interface CaseRow {
  id: string;
  cleaner_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string;
  decision: string | null;
  final_outcome: string | null;
  reasons: string[];
  convictions: ConvictionRow[];
  pending_charges: PendingRow[];
  created_at: string;
  decided_by: string | null;
  final_note: string | null;
}
interface ConvictionRow { category: string; offense: string; convictionDate: string; isConviction: true }
interface PendingRow { category: string; offense: string }
interface CleanerOpt { id: string; first_name: string | null; last_name: string | null; email: string | null }

const STATUS_BADGE: Record<string, "info" | "warning" | "success" | "error" | "default"> = {
  needs_input: "info",
  executive_review: "warning",
  hold: "warning",
  auto_decided: "default",
  decided: "default",
};
const DECISION_BADGE: Record<string, "success" | "error" | "warning" | "info"> = {
  auto_approve: "success",
  auto_deny: "error",
  executive_review: "warning",
  hold: "info",
};

export function AdjudicationTab() {
  const { getToken } = useAuth();
  const authed = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  }, [getToken]);

  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CaseRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [cleaners, setCleaners] = useState<CleanerOpt[]>([]);
  const [newCleanerId, setNewCleanerId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await authed("/admin/adjudication/cases");
    if (res.ok) {
      const d = (await res.json()) as { cases: CaseRow[] };
      setRows(d.cases);
    }
    setLoading(false);
  }, [authed]);

  useEffect(() => { void load(); }, [load]);

  async function openCreate() {
    setCreating(true);
    const res = await authed("/admin/cleaners?limit=100");
    if (res.ok) {
      const d = (await res.json()) as { cleaners: CleanerOpt[] };
      setCleaners(d.cleaners ?? []);
    }
  }

  async function createCase() {
    if (!newCleanerId) return;
    const res = await authed("/admin/adjudication/cases", { method: "POST", body: JSON.stringify({ cleanerId: newCleanerId }) });
    if (res.ok) {
      toast.success("Case opened");
      setCreating(false);
      setNewCleanerId("");
      await load();
    } else {
      toast.error("Couldn't open the case.");
    }
  }

  const columns: Column<CaseRow>[] = [
    { header: "Applicant", cell: (r: CaseRow) => (
      <div><span className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</span>
        <span className="block text-xs text-slate-400">{r.email ?? ""}</span></div>
    ) },
    { header: "Status", cell: (r: CaseRow) => <Badge variant={STATUS_BADGE[r.status] ?? "default"}>{r.status.replace(/_/g, " ")}</Badge> },
    { header: "Engine decision", cell: (r: CaseRow) => r.decision
      ? <Badge variant={DECISION_BADGE[r.decision] ?? "default"}>{r.decision.replace(/_/g, " ")}</Badge>
      : <span className="text-xs text-slate-400">not evaluated</span> },
    { header: "Outcome", cell: (r: CaseRow) => r.final_outcome
      ? <Badge variant={r.final_outcome === "approved" ? "success" : "error"}>{r.final_outcome}</Badge>
      : <span className="text-xs text-slate-400">—</span> },
    { header: "Opened", cell: (r: CaseRow) => <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</span> },
    { header: "", cell: (r: CaseRow) => <Button variant="secondary" onClick={() => setDetail(r)}>Open</Button> },
  ];

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Gavel className="h-4 w-4 text-seafoam-600" />
          Deterministic adjudication under the{" "}
          <a href="https://legal.getsweepr.com/background-check-adjudication" target="_blank" rel="noopener noreferrer" className="font-medium text-seafoam-700 underline">
            Background Check Adjudication Policy
          </a>. Convictions only; pending charges hold the application.
        </div>
        <Button onClick={() => void openCreate()}><Plus className="mr-1 h-4 w-4" /> New case</Button>
      </Card>

      {loading ? <TableSkeleton cols={6} /> : rows.length === 0
        ? <EmptyState title="No adjudication cases" description="Open a case to evaluate an applicant's background check under the policy." />
        : <DataTable columns={columns} rows={rows} />}

      {creating && (
        <Modal open onOpenChange={(o) => !o && setCreating(false)} title="Open adjudication case">
          <div className="space-y-4">
            <Select label="Applicant (cleaner)" value={newCleanerId} onChange={(e) => setNewCleanerId(e.target.value)}
              options={[{ value: "", label: "Select…" }, ...cleaners.map((c) => ({
                value: c.id, label: `${[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed"} — ${c.email ?? ""}`,
              }))]} />
            <Button onClick={() => void createCase()} disabled={!newCleanerId} className="w-full">Open case</Button>
          </div>
        </Modal>
      )}

      {detail && (
        <CaseModal row={detail} onClose={() => setDetail(null)} authed={authed} onChanged={async () => { setDetail(null); await load(); }} />
      )}
    </div>
  );
}

function CaseModal({ row, onClose, authed, onChanged }: {
  row: CaseRow;
  onClose: () => void;
  authed: (path: string, init?: RequestInit) => Promise<Response>;
  onChanged: () => Promise<void>;
}) {
  const [convictions, setConvictions] = useState<ConvictionRow[]>(row.convictions ?? []);
  const [pending, setPending] = useState<PendingRow[]>(row.pending_charges ?? []);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const decided = row.status === "decided" || row.status === "auto_decided";

  function addConviction() {
    setConvictions((c) => [...c, { category: "nonviolent_misdemeanor", offense: "", convictionDate: "", isConviction: true }]);
  }
  function addPending() {
    setPending((p) => [...p, { category: "nonviolent_misdemeanor", offense: "" }]);
  }

  async function evaluate() {
    const bad = convictions.some((c) => !c.offense.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(c.convictionDate))
      || pending.some((p) => !p.offense.trim());
    if (bad) { toast.error("Every entry needs an offense name, and convictions need a YYYY-MM-DD date."); return; }
    setBusy(true);
    try {
      const res = await authed(`/admin/adjudication/cases/${row.id}/record`, {
        method: "PUT",
        body: JSON.stringify({ convictions, pendingCharges: pending }),
      });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { result: { decision: string } };
      toast.success(`Engine decision: ${d.result.decision.replace(/_/g, " ")}`);
      await onChanged();
    } catch {
      toast.error("Evaluation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(outcome: "approved" | "denied") {
    if (note.trim().length < 3) { toast.error("A decision note is required."); return; }
    setBusy(true);
    try {
      const res = await authed(`/admin/adjudication/cases/${row.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ outcome, note: note.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Case ${outcome}`);
      await onChanged();
    } catch {
      toast.error("Couldn't record the decision.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`Adjudication — ${[row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "case"}`}>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        {row.decision && (
          <Card className="space-y-1.5 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-charcoal dark:text-white">
              <Scale className="h-4 w-4 text-seafoam-600" /> Engine decision:{" "}
              <Badge variant={DECISION_BADGE[row.decision] ?? "default"}>{row.decision.replace(/_/g, " ")}</Badge>
            </div>
            <ul className="list-disc pl-5 text-xs text-slate-500">
              {(row.reasons ?? []).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            {row.final_note && <p className="text-xs text-slate-500">Note: {row.final_note}</p>}
          </Card>
        )}

        {!decided && (
          <>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-charcoal dark:text-white">Convictions</h3>
                <Button variant="secondary" onClick={addConviction}><Plus className="mr-1 h-3.5 w-3.5" /> Add conviction</Button>
              </div>
              {convictions.length === 0 && <p className="text-xs text-slate-400">None entered — the engine treats an empty record as clean.</p>}
              <div className="space-y-2">
                {convictions.map((cv, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700 sm:grid-cols-[1fr_1fr_140px_36px]">
                    <Select aria-label="Offense category" value={cv.category}
                      onChange={(e) => setConvictions((c) => c.map((x, j) => j === i ? { ...x, category: e.target.value } : x))}
                      options={CATEGORIES} />
                    <Input aria-label="Offense" placeholder="Offense (as on report)" value={cv.offense}
                      onChange={(e) => setConvictions((c) => c.map((x, j) => j === i ? { ...x, offense: e.target.value } : x))} />
                    <Input aria-label="Conviction date" type="date" value={cv.convictionDate}
                      onChange={(e) => setConvictions((c) => c.map((x, j) => j === i ? { ...x, convictionDate: e.target.value } : x))} />
                    <button type="button" aria-label="Remove conviction" onClick={() => setConvictions((c) => c.filter((_, j) => j !== i))}
                      className="flex items-center justify-center text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-charcoal dark:text-white">Pending charges</h3>
                <Button variant="secondary" onClick={addPending}><Plus className="mr-1 h-3.5 w-3.5" /> Add pending charge</Button>
              </div>
              {pending.length === 0 && <p className="text-xs text-slate-400">None — any pending charge places the application on hold until final disposition.</p>}
              <div className="space-y-2">
                {pending.map((p, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700 sm:grid-cols-[1fr_1fr_36px]">
                    <Select aria-label="Charge category" value={p.category}
                      onChange={(e) => setPending((c) => c.map((x, j) => j === i ? { ...x, category: e.target.value } : x))}
                      options={CATEGORIES} />
                    <Input aria-label="Charge" placeholder="Charge (as filed)" value={p.offense}
                      onChange={(e) => setPending((c) => c.map((x, j) => j === i ? { ...x, offense: e.target.value } : x))} />
                    <button type="button" aria-label="Remove pending charge" onClick={() => setPending((c) => c.filter((_, j) => j !== i))}
                      className="flex items-center justify-center text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </section>

            <Button onClick={() => void evaluate()} disabled={busy} className="w-full">
              {busy ? "Evaluating…" : "Run policy engine"}
            </Button>

            {(row.status === "executive_review" || row.status === "hold") && (
              <section className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-charcoal dark:text-white">Executive Review decision</h3>
                <p className="text-xs text-slate-500">
                  Discretionary, individualized review per the policy. A denial starts the FCRA
                  adverse-action process — it is not communicated automatically.
                </p>
                <Textarea label="Decision note (required)" value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                  placeholder="Factors considered: time since offense, rehabilitation, references…" />
                <div className="flex gap-2">
                  <Button onClick={() => void decide("approved")} disabled={busy} className="flex-1">Approve</Button>
                  <Button variant="secondary" onClick={() => void decide("denied")} disabled={busy} className="flex-1">Deny (start adverse action)</Button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
