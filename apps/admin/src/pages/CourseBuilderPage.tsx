import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { Plus, FileStack, GraduationCap, Pencil, Archive } from "lucide-react";
import { toast } from "@sweepr/ui";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Course {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  required: boolean;
  current_version_number: number | null;
  updated_at: string;
}

interface LegacyModule {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  required_type: string;
  active: boolean;
  version: number;
  lesson_count: number;
}

const statusStyles: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-200 text-slate-600",
};

export function CourseBuilderPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [legacy, setLegacy] = useState<LegacyModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/courses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCourses(data.courses ?? []);
        setLegacy(data.legacyModules ?? []);
      } else {
        toast.error("Failed to load courses");
      }
    } catch {
      toast.error("Failed to load courses");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function createCourse() {
    setCreating(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/admin/courses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: "Untitled course", required: true }),
      });
      if (res.ok) {
        const { id } = await res.json();
        navigate(`/courses/${id}`);
      } else {
        toast.error("Failed to create course");
      }
    } catch {
      toast.error("Failed to create course");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Course Builder</h1>
          <p className="text-sm text-slate-500 mt-1">
            Author next-generation training. Existing courses live in the library
            below and stay active until a new course replaces them.
          </p>
        </div>
        <button
          onClick={createCourse}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg bg-seafoam-500 px-4 py-2 text-sm font-semibold text-white hover:bg-seafoam-600 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New course
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
              <FileStack className="h-4 w-4" /> Courses
            </h2>
            {courses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                No courses yet. Create one to open the editor.
              </div>
            ) : (
              <div className="grid gap-3">
                {courses.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/courses/${c.id}`)}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-seafoam-400 hover:shadow-sm transition"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{c.title}</div>
                      <div className="text-xs text-slate-500">
                        {c.category ?? "Uncategorized"} ·{" "}
                        {c.current_version_number ? `v${c.current_version_number}` : "no version"}
                        {c.required ? " · required" : " · optional"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[c.status] ?? statusStyles.draft}`}>
                        {c.status}
                      </span>
                      <Pencil className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
              <GraduationCap className="h-4 w-4" /> Legacy library (read-only)
            </h2>
            <p className="text-xs text-slate-400 mb-3">
              These modules are the current certification of record. They keep
              working until replaced by a published course.
            </p>
            <div className="grid gap-2">
              {legacy.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-700">{m.title}</div>
                    <div className="text-xs text-slate-400">
                      {m.required_type} · {m.lesson_count} lessons · v{m.version}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Archive className="h-3.5 w-3.5" /> library
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
