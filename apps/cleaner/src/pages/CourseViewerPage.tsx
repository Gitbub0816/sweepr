import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { ChevronLeft, ChevronRight, BookOpen, CheckCircle2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

interface Block {
  id: string;
  block_type: string;
  x: number; y: number; width: number; height: number; z_index: number;
  props: Record<string, unknown>;
}
interface Slide {
  id: string;
  title: string | null;
  background: Record<string, unknown>;
  blocks: Block[];
}
interface CourseSummary {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  version_number: number;
}

export function CourseViewerPage() {
  const { id } = useParams<{ id: string }>();
  return id ? <CoursePlayer courseId={id} /> : <CourseLibrary />;
}

// ─── Library ──────────────────────────────────────────────────────────────────

function CourseLibrary() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch(`${API}/courses`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setCourses((await res.json()).courses ?? []);
      setLoading(false);
    })();
  }, [getToken]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Courses</h1>
      <p className="text-sm text-slate-500 mb-6">Interactive training courses.</p>
      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          No published courses yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {courses.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/courses/${c.id}`)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-seafoam-400 hover:shadow-sm transition"
            >
              <BookOpen className="h-5 w-5 text-seafoam-500" />
              <div>
                <div className="font-semibold text-slate-900">{c.title}</div>
                {c.description && <div className="text-xs text-slate-500">{c.description}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Player ───────────────────────────────────────────────────────────────────

function CoursePlayer({ courseId }: { courseId: string }) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [versionId, setVersionId] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch(`${API}/courses/${courseId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setTitle(data.course.title);
        setVersionId(data.version_id);
        setSlides(data.slides ?? []);
      }
    })();
  }, [courseId, getToken]);

  const reportProgress = useCallback(async (percent: number, completed: boolean, slideId?: string) => {
    if (!versionId) return;
    const token = await getToken();
    await fetch(`${API}/courses/${courseId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ course_version_id: versionId, progress_percent: percent, completed, slide_id: slideId }),
    });
  }, [courseId, getToken, versionId]);

  const slide = slides[index];

  function next() {
    if (index < slides.length - 1) {
      const ni = index + 1;
      setIndex(ni);
      reportProgress(Math.round(((ni + 1) / slides.length) * 100), false, slide?.id);
    } else {
      setDone(true);
      reportProgress(100, true, slide?.id);
    }
  }

  if (!slide && !done) {
    return <div className="grid min-h-[60vh] place-items-center text-slate-400 text-sm">Loading course…</div>;
  }

  if (done) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h2 className="mt-4 text-xl font-bold text-slate-900">Course complete</h2>
          <p className="mt-1 text-sm text-slate-500">{title}</p>
          <button onClick={() => navigate("/courses")} className="mt-6 rounded-lg bg-seafoam-500 px-5 py-2 text-sm font-semibold text-white hover:bg-seafoam-600">
            Back to courses
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => navigate("/courses")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft className="h-4 w-4" /> Exit
        </button>
        <span className="text-xs text-slate-400">{index + 1} / {slides.length}</span>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-seafoam-500 transition-all" style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
      </div>

      {/* Slide canvas (mobile portrait) */}
      <div
        className="relative mx-auto aspect-[9/16] w-full overflow-hidden rounded-2xl bg-white shadow-lg"
        style={{ background: (slide.background?.color as string) ?? "#ffffff" }}
      >
        {slide.blocks.map((b) => (
          <div key={b.id} className="absolute"
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.width}%`, height: `${b.height}%`, zIndex: b.z_index }}>
            <LearnerBlock block={b} />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={next} className="flex items-center gap-1 rounded-lg bg-seafoam-500 px-5 py-2 text-sm font-semibold text-white hover:bg-seafoam-600">
          {index === slides.length - 1 ? "Finish" : "Next"} <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function LearnerBlock({ block }: { block: Block }) {
  const p = block.props;
  switch (block.block_type) {
    case "text":
      return (
        <div className="h-full w-full overflow-hidden" style={{
          fontSize: `${(p.size as number) ?? 18}px`, fontWeight: (p.weight as number) ?? 600,
          color: (p.color as string) ?? "#0f172a", textAlign: (p.align as "left") ?? "left",
        }}>{(p.content as string) ?? ""}</div>
      );
    case "image":
      return (p.url as string) ? (
        <img src={p.url as string} alt={(p.caption as string) ?? ""} className="h-full w-full rounded-lg"
          style={{ objectFit: (p.fit as "cover") ?? "cover" }} />
      ) : null;
    case "video":
      return (p.streamId as string) ? (
        <iframe
          title="training video"
          className="h-full w-full rounded-lg"
          src={`https://iframe.videodelivery.net/${p.streamId as string}`}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
        />
      ) : (
        <div className="grid h-full w-full place-items-center rounded-lg bg-slate-900 text-xs text-slate-300">No video</div>
      );
    case "button":
      return (
        <div className="grid h-full w-full place-items-center rounded-lg bg-seafoam-500 text-sm font-semibold text-white">
          {(p.label as string) ?? "Button"}
        </div>
      );
    case "checklist":
      return (
        <div className="h-full w-full overflow-auto rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {((p.items as string[]) ?? []).map((it, i) => (
            <label key={i} className="flex items-center gap-2 py-0.5"><input type="checkbox" /> {it}</label>
          ))}
        </div>
      );
    case "acknowledgment":
      return (
        <label className="flex h-full w-full items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <input type="checkbox" /> {(p.statement as string) ?? "I acknowledge."}
        </label>
      );
    case "quiz":
      return (
        <div className="h-full w-full overflow-auto rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
          Quiz — {((p.questions as unknown[]) ?? []).length} question(s)
        </div>
      );
    default:
      return null;
  }
}
