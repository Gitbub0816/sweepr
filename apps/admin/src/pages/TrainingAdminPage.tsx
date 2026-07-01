import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  GraduationCap,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search,
  RefreshCw,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import {
  DashboardShell,
  Card,
  Button,
  Input,
  Badge,
  toast,
} from "@sweepr/ui";

const API_URL = import.meta.env.VITE_API_URL ?? "";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TrainingModule {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  required_type: string;
  service_key: string | null;
  estimated_minutes: number | null;
  active: boolean;
  sort_order: number;
  requires_quiz: boolean;
  passing_score: number;
  max_attempts: number;
  version: number;
  lessonCount: number;
  questionCount: number;
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  body: string;
  sort_order: number;
  estimated_minutes: number | null;
}

interface Question {
  id: string;
  module_id: string;
  question: string;
  type: string;
  choices: string[];
  correct_answer: string;
  explanation: string | null;
  sort_order: number;
}

interface CleanerProgress {
  cleaner: {
    id: string;
    training_status: string | null;
    required_training_completed: boolean;
    background_check_unlocked: boolean;
    training_completed_at: string | null;
  };
  progress: Array<{
    id: string;
    module_id: string;
    module_title: string;
    status: string;
    score: number | null;
    attempt_count: number;
    completed_at: string | null;
    started_at: string | null;
  }>;
  attempts: Array<{
    id: string;
    module_id: string;
    module_title: string;
    score: number | null;
    passed: boolean;
    started_at: string;
    completed_at: string | null;
  }>;
}

// ─── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(
  path: string,
  token: string,
  opts?: RequestInit
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
}

// ─── Module Form ───────────────────────────────────────────────────────────────

interface ModuleFormData {
  title: string;
  description: string;
  category: string;
  required_type: "base" | "service_specific" | "optional";
  service_key: string;
  estimated_minutes: string;
  sort_order: string;
  passing_score: string;
  max_attempts: string;
  active: boolean;
}

const emptyModuleForm: ModuleFormData = {
  title: "",
  description: "",
  category: "",
  required_type: "base",
  service_key: "",
  estimated_minutes: "30",
  sort_order: "0",
  passing_score: "80",
  max_attempts: "3",
  active: true,
};

function ModuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<ModuleFormData>;
  onSave: (data: ModuleFormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ModuleFormData>({ ...emptyModuleForm, ...initial });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ModuleFormData>(k: K, v: ModuleFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">
            Title
          </label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">
            Description
          </label>
          <textarea
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-charcoal dark:text-slate-200">
            Required Type
          </label>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            value={form.required_type}
            onChange={(e) => set("required_type", e.target.value as ModuleFormData["required_type"])}
          >
            <option value="base">Base (required for all)</option>
            <option value="service_specific">Service-specific</option>
            <option value="optional">Optional</option>
          </select>
        </div>
        <Input
          label="Category"
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
          placeholder="onboarding, safety, quality…"
        />
        {form.required_type === "service_specific" && (
          <Input
            label="Service Key"
            value={form.service_key}
            onChange={(e) => set("service_key", e.target.value)}
            placeholder="standard_cleaning, deep_cleaning…"
          />
        )}
        <Input
          label="Estimated Minutes"
          type="number"
          value={form.estimated_minutes}
          onChange={(e) => set("estimated_minutes", e.target.value)}
        />
        <Input
          label="Sort Order"
          type="number"
          value={form.sort_order}
          onChange={(e) => set("sort_order", e.target.value)}
        />
        <Input
          label="Passing Score (%)"
          type="number"
          min={0}
          max={100}
          value={form.passing_score}
          onChange={(e) => set("passing_score", e.target.value)}
        />
        <Input
          label="Max Attempts"
          type="number"
          min={1}
          value={form.max_attempts}
          onChange={(e) => set("max_attempts", e.target.value)}
        />
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            checked={form.active}
            onChange={(e) => set("active", e.target.checked)}
            className="accent-seafoam-500"
          />
          <label htmlFor="active" className="text-sm font-medium text-charcoal dark:text-slate-200">
            Active
          </label>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => void handleSave()} loading={saving} disabled={!form.title.trim()}>
          Save module
        </Button>
      </div>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function TrainingAdminPage() {
  const { getToken } = useAuth();

  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Record<string, Lesson[]>>({});
  const [questions, setQuestions] = useState<Record<string, Question[]>>({});
  const [showModuleForm, setShowModuleForm] = useState(false);
  const [editingModule, setEditingModule] = useState<TrainingModule | null>(null);
  const [cleanerSearch, setCleanerSearch] = useState("");
  const [cleanerProgress, setCleanerProgress] = useState<CleanerProgress | null>(null);
  const [searchingCleaner, setSearchingCleaner] = useState(false);

  const loadModules = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await apiFetch("/admin/training/modules", token ?? "");
      if (res.ok) {
        const data = (await res.json()) as TrainingModule[];
        setModules(data);
      }
    } catch {
      toast.error("Failed to load modules.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  async function loadModuleDetail(moduleId: string) {
    const token = await getToken();
    const [modRes, qRes] = await Promise.all([
      apiFetch(`/training/modules/${moduleId}`, token ?? ""),
      apiFetch(`/training/modules/${moduleId}/quiz`, token ?? ""),
    ]);

    if (modRes.ok) {
      const data = (await modRes.json()) as { lessons: Lesson[] };
      setLessons((prev) => ({ ...prev, [moduleId]: data.lessons }));
    }

    if (qRes.ok) {
      const data = (await qRes.json()) as { questions: Question[] };
      setQuestions((prev) => ({ ...prev, [moduleId]: data.questions as Question[] }));
    }
  }

  function toggleModule(id: string) {
    if (expandedModule === id) {
      setExpandedModule(null);
    } else {
      setExpandedModule(id);
      if (!lessons[id]) void loadModuleDetail(id);
    }
  }

  async function createModule(data: ModuleFormData) {
    const token = await getToken();
    const res = await apiFetch("/admin/training/modules", token ?? "", {
      method: "POST",
      body: JSON.stringify({
        ...data,
        estimated_minutes: parseInt(data.estimated_minutes, 10) || null,
        sort_order: parseInt(data.sort_order, 10),
        passing_score: parseInt(data.passing_score, 10),
        max_attempts: parseInt(data.max_attempts, 10),
      }),
    });
    if (res.ok) {
      toast.success("Module created.");
      setShowModuleForm(false);
      void loadModules();
    } else {
      toast.error("Failed to create module.");
    }
  }

  async function updateModule(id: string, data: ModuleFormData) {
    const token = await getToken();
    const res = await apiFetch(`/admin/training/modules/${id}`, token ?? "", {
      method: "PATCH",
      body: JSON.stringify({
        ...data,
        estimated_minutes: parseInt(data.estimated_minutes, 10) || null,
        sort_order: parseInt(data.sort_order, 10),
        passing_score: parseInt(data.passing_score, 10),
        max_attempts: parseInt(data.max_attempts, 10),
      }),
    });
    if (res.ok) {
      toast.success("Module updated.");
      setEditingModule(null);
      void loadModules();
    } else {
      toast.error("Failed to update module.");
    }
  }

  async function deleteModule(id: string) {
    if (!confirm("Deactivate this module?")) return;
    const token = await getToken();
    const res = await apiFetch(`/admin/training/modules/${id}`, token ?? "", {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Module deactivated.");
      void loadModules();
    } else {
      toast.error("Failed to deactivate module.");
    }
  }

  async function resetAttempts(cleanerId: string, moduleId: string) {
    const token = await getToken();
    const res = await apiFetch(`/admin/training/cleaners/${cleanerId}/reset-attempts`, token ?? "", {
      method: "POST",
      body: JSON.stringify({ moduleId }),
    });
    if (res.ok) {
      toast.success("Attempts reset.");
      void searchCleaner();
    } else {
      toast.error("Failed to reset attempts.");
    }
  }

  async function searchCleaner() {
    if (!cleanerSearch.trim()) return;
    setSearchingCleaner(true);
    try {
      const token = await getToken();
      const res = await apiFetch(
        `/admin/training/cleaners/${cleanerSearch.trim()}/progress`,
        token ?? ""
      );
      if (res.ok) {
        const data = (await res.json()) as CleanerProgress;
        setCleanerProgress(data);
      } else {
        toast.error("Cleaner not found.");
        setCleanerProgress(null);
      }
    } catch {
      toast.error("Search failed.");
    } finally {
      setSearchingCleaner(false);
    }
  }

  const baseModules = modules.filter((m) => m.required_type === "base");
  const serviceModules = modules.filter((m) => m.required_type === "service_specific");
  const optionalModules = modules.filter((m) => m.required_type === "optional");

  return (
    <DashboardShell
      title="Training Management"
      description="Manage training modules, lessons, and quiz questions."
      actions={
        <Button onClick={() => setShowModuleForm(true)}>
          <Plus className="h-4 w-4" /> New Module
        </Button>
      }
    >
      {showModuleForm && (
        <ModuleForm
          onSave={createModule}
          onCancel={() => setShowModuleForm(false)}
        />
      )}

      {editingModule && (
        <ModuleForm
          initial={{
            title: editingModule.title,
            description: editingModule.description ?? "",
            category: editingModule.category ?? "",
            required_type: editingModule.required_type as ModuleFormData["required_type"],
            service_key: editingModule.service_key ?? "",
            estimated_minutes: String(editingModule.estimated_minutes ?? 30),
            sort_order: String(editingModule.sort_order),
            passing_score: String(editingModule.passing_score),
            max_attempts: String(editingModule.max_attempts),
            active: editingModule.active,
          }}
          onSave={(data) => updateModule(editingModule.id, data)}
          onCancel={() => setEditingModule(null)}
        />
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-2xl font-bold text-charcoal dark:text-white">{baseModules.length}</p>
          <p className="text-sm text-slate-500">Base Modules</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-charcoal dark:text-white">{serviceModules.length}</p>
          <p className="text-sm text-slate-500">Service Modules</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-charcoal dark:text-white">{modules.length}</p>
          <p className="text-sm text-slate-500">Total Modules</p>
        </Card>
      </div>

      {/* Module list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <>
          {[
            { label: "Base Modules", items: baseModules },
            { label: "Service-Specific Modules", items: serviceModules },
            { label: "Optional Modules", items: optionalModules },
          ].map(({ label, items }) =>
            items.length > 0 ? (
              <div key={label}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {label} ({items.length})
                </h2>
                <div className="space-y-2">
                  {items.map((m) => (
                    <div key={m.id} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-center gap-3 p-4">
                        <button
                          type="button"
                          onClick={() => toggleModule(m.id)}
                          className="flex flex-1 items-center gap-3 text-left"
                        >
                          {expandedModule === m.id ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-charcoal dark:text-white">
                              {m.title}
                              {!m.active && (
                                <span className="ml-2 text-xs text-slate-400">(inactive)</span>
                              )}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <Badge>{m.required_type}</Badge>
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <BookOpen className="h-3 w-3" /> {m.lessonCount} lessons
                              </span>
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <HelpCircle className="h-3 w-3" /> {m.questionCount} questions
                              </span>
                            </div>
                          </div>
                        </button>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingModule(m)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            aria-label="Edit module"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteModule(m.id)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                            aria-label="Deactivate module"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {expandedModule === m.id && (
                        <div className="border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-800">
                          {m.description && (
                            <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                              {m.description}
                            </p>
                          )}
                          <div className="grid gap-4 sm:grid-cols-2">
                            {/* Lessons */}
                            <div>
                              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Lessons
                              </h3>
                              {lessons[m.id] ? (
                                <div className="space-y-1">
                                  {lessons[m.id].map((l) => (
                                    <div
                                      key={l.id}
                                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800"
                                    >
                                      <span className="truncate text-sm text-charcoal dark:text-white">
                                        {l.sort_order + 1}. {l.title}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400">Loading…</p>
                              )}
                            </div>

                            {/* Questions */}
                            <div>
                              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Quiz Questions
                              </h3>
                              {questions[m.id] ? (
                                <div className="space-y-1">
                                  {questions[m.id].map((q, qi) => (
                                    <div
                                      key={q.id}
                                      className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800"
                                    >
                                      <p className="truncate text-sm text-charcoal dark:text-white">
                                        {qi + 1}. {q.question}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400">Loading…</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </>
      )}

      {/* Cleaner Progress Search */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-charcoal dark:text-white">
          Cleaner Training Progress
        </h2>
        <Card>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Cleaner ID"
                value={cleanerSearch}
                onChange={(e) => setCleanerSearch(e.target.value)}
                placeholder="Enter cleaner UUID…"
                onKeyDown={(e) => e.key === "Enter" && void searchCleaner()}
              />
            </div>
            <div className="mt-6">
              <Button
                onClick={() => void searchCleaner()}
                loading={searchingCleaner}
                variant="secondary"
              >
                <Search className="h-4 w-4" /> Search
              </Button>
            </div>
          </div>

          {cleanerProgress && (
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-3">
                <Badge variant={cleanerProgress.cleaner.required_training_completed ? "success" : "default"}>
                  Training: {cleanerProgress.cleaner.training_status ?? "not_started"}
                </Badge>
                <Badge variant={cleanerProgress.cleaner.background_check_unlocked ? "success" : "default"}>
                  BG Check: {cleanerProgress.cleaner.background_check_unlocked ? "Unlocked" : "Locked"}
                </Badge>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-charcoal dark:text-white">
                  Module Progress
                </h3>
                <div className="space-y-2">
                  {cleanerProgress.progress.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700"
                    >
                      <div>
                        <p className="text-sm font-medium text-charcoal dark:text-white">
                          {p.module_title}
                        </p>
                        <div className="mt-1 flex gap-2">
                          <Badge
                            variant={
                              p.status === "passed"
                                ? "success"
                                : p.status === "failed"
                                ? "error"
                                : "default"
                            }
                          >
                            {p.status}
                          </Badge>
                          {p.score !== null && (
                            <span className="text-xs text-slate-500">{p.score}%</span>
                          )}
                          <span className="text-xs text-slate-500">
                            {p.attempt_count} attempt{p.attempt_count !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      {p.status === "failed" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void resetAttempts(cleanerProgress.cleaner.id, p.module_id)
                          }
                        >
                          <RefreshCw className="h-3 w-3" /> Reset
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Placeholder icon for empty state */}
      {!loading && modules.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <GraduationCap className="h-12 w-12 text-slate-300" />
          <p className="text-slate-500">No training modules found. Run the seed migration to populate them.</p>
        </div>
      )}
    </DashboardShell>
  );
}
