import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import {
  GraduationCap,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Clock,
  BookOpen,
  AlertCircle,
  RefreshCw,
  Trophy,
  Lock,
  ArrowRight,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { Card, Button, Badge, DashboardShell, toast } from "@sweepr/ui";

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
  sort_order: number;
  requires_quiz: boolean;
  passing_score: number;
  max_attempts: number;
  progress: ModuleProgress | null;
}

interface ModuleProgress {
  status: string;
  score: number | null;
  attempt_count: number;
  completed_at: string | null;
  last_lesson_id: string | null;
  required_for_activation: boolean;
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  body: string;
  video_url: string | null;
  sort_order: number;
  estimated_minutes: number | null;
}

interface QuizQuestion {
  id: string;
  question: string;
  type: string;
  choices: string[];
  sort_order: number;
}

interface QuizResult {
  questionId: string;
  question: string;
  submittedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string | null;
}

interface ProgressSummary {
  totalRequired: number;
  totalPassed: number;
  allRequiredComplete: boolean;
  backgroundCheckUnlocked: boolean;
  trainingStatus: string;
}

type View = "list" | "lessons" | "quiz" | "quiz-result";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(progress: ModuleProgress | null, t: (key: string) => string) {
  if (!progress || progress.status === "not_started") {
    return <Badge variant="default">{t("cleaner.training.notStarted")}</Badge>;
  }
  if (progress.status === "passed") {
    return <Badge variant="success">{t("cleaner.training.passed")}</Badge>;
  }
  if (progress.status === "failed") {
    return <Badge variant="error">{t("cleaner.training.failed")}</Badge>;
  }
  if (progress.status === "in_progress") {
    return <Badge variant="info">{t("cleaner.training.inProgress")}</Badge>;
  }
  return <Badge variant="default">{progress.status}</Badge>;
}

function Confetti() {
  const pieces = useMemo(() => {
    const colors = ["#14b8a6", "#0d9488", "#f59e0b", "#fbbf24", "#38bdf8", "#a78bfa"];
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 2.4 + Math.random() * 1.8,
      color: colors[i % colors.length],
    }));
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Academy Dashboard ───────────────────────────────────────────────────────

function ModuleCard({
  module,
  index,
  locked,
  onSelect,
}: {
  module: TrainingModule;
  index: number;
  locked: boolean;
  onSelect: (m: TrainingModule) => void;
}) {
  const { t } = useTranslation();
  const status = module.progress?.status ?? "not_started";
  const passed = status === "passed";
  const inProgress = status === "in_progress";

  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => !locked && onSelect(module)}
      className={`group flex w-full flex-col gap-3 rounded-2xl border p-5 text-left transition-all ${
        locked
          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-900/40"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-seafoam-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-seafoam-600"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
            passed
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30"
              : locked
                ? "bg-slate-200 text-slate-400 dark:bg-slate-800"
                : "bg-seafoam-100 text-seafoam-600 dark:bg-seafoam-900/30"
          }`}
        >
          {passed ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : locked ? (
            <Lock className="h-5 w-5" />
          ) : (
            index
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-charcoal dark:text-white">{module.title}</p>
          {module.description && (
            <p className="mt-1 line-clamp-2 text-sm text-slate-500">{module.description}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {locked ? <Badge variant="default">{t("cleaner.training.locked")}</Badge> : statusBadge(module.progress, t)}
        {module.estimated_minutes ? (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="h-3 w-3" /> {module.estimated_minutes} min
          </span>
        ) : null}
        {module.requires_quiz && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <HelpCircle className="h-3 w-3" /> Quiz
          </span>
        )}
      </div>

      {inProgress && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full w-1/2 rounded-full bg-seafoam-500" />
        </div>
      )}

      {!locked && (
        <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-seafoam-600 group-hover:gap-2">
          {passed ? t("common.edit") : inProgress ? t("common.continue") : t("common.getStarted")}
          <ChevronRight className="h-4 w-4 transition-all" />
        </span>
      )}
    </button>
  );
}

function ModuleList({
  modules,
  summary,
  onSelect,
}: {
  modules: TrainingModule[];
  summary: ProgressSummary;
  onSelect: (m: TrainingModule) => void;
}) {
  const { t } = useTranslation();
  const baseModules = modules
    .filter((m) => m.required_type === "base")
    .sort((a, b) => a.sort_order - b.sort_order);
  const serviceModules = modules
    .filter((m) => m.required_type === "service_specific")
    .sort((a, b) => a.sort_order - b.sort_order);

  const pct =
    summary.totalRequired > 0
      ? Math.round((summary.totalPassed / summary.totalRequired) * 100)
      : 0;

  const minutesRemaining = baseModules
    .filter((m) => m.progress?.status !== "passed")
    .reduce((sum, m) => sum + (m.estimated_minutes ?? 0), 0);

  // Required modules unlock sequentially.
  let firstIncomplete = baseModules.findIndex((m) => m.progress?.status !== "passed");
  if (firstIncomplete === -1) firstIncomplete = baseModules.length;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-seafoam-500 via-seafoam-600 to-teal-700 p-6 text-white shadow-lg sm:p-8">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-10 right-20 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <GraduationCap className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{t("cleaner.training.title")}</h1>
              <p className="text-sm text-seafoam-50">
                {t("cleaner.training.subtitle")}
              </p>
            </div>
          </div>

          <div className="mt-6 max-w-xl">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>
                {summary.totalPassed} of {summary.totalRequired} required modules complete
              </span>
              <span>{pct}%</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-seafoam-50">
              {minutesRemaining > 0 ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> ~{minutesRemaining} min remaining
                </span>
              ) : (
                <span className="flex items-center gap-1 font-semibold">
                  <Sparkles className="h-3.5 w-3.5" /> All required training complete
                </span>
              )}
            </div>
          </div>

          {summary.allRequiredComplete && (
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/15 px-4 py-3 text-sm font-medium backdrop-blur">
              <Trophy className="h-5 w-5 shrink-0" />
              Your background check is now unlocked. Great work!
            </div>
          )}
        </div>
      </div>

      {/* Required modules */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("cleaner.training.requiredModules")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {baseModules.map((m, i) => (
            <ModuleCard
              key={m.id}
              module={m}
              index={i + 1}
              locked={i > firstIncomplete}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      {/* Service modules */}
      {serviceModules.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("cleaner.training.serviceModules")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {serviceModules.map((m, i) => (
              <ModuleCard
                key={m.id}
                module={m}
                index={i + 1}
                locked={!summary.allRequiredComplete}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lesson Viewer ─────────────────────────────────────────────────────────────

function LessonViewer({
  module,
  lessons,
  progress,
  onBack,
  onStartQuiz,
  getToken,
}: {
  module: TrainingModule;
  lessons: Lesson[];
  progress: ModuleProgress | null;
  onBack: () => void;
  onStartQuiz: () => void;
  getToken: () => Promise<string | null>;
}) {
  const [currentLesson, setCurrentLesson] = useState(0);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [canComplete, setCanComplete] = useState(false);
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);

  const lesson = lessons[currentLesson];
  const allComplete = completedLessons.size >= lessons.length;
  const passed = progress?.status === "passed";

  // Enable "Mark Complete" after 30s or scroll to bottom.
  useEffect(() => {
    setCanComplete(false);
    const timer = setTimeout(() => setCanComplete(true), 30000);
    return () => clearTimeout(timer);
  }, [currentLesson]);

  useEffect(() => {
    function onScroll() {
      const el = contentRef.current;
      if (!el) return;
      const reachedBottom =
        window.innerHeight + window.scrollY >= el.offsetTop + el.offsetHeight - 120;
      if (reachedBottom) setCanComplete(true);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [currentLesson]);

  const markLessonComplete = useCallback(
    async (lessonId: string) => {
      if (marking) return;
      setMarking(true);
      try {
        const token = await getToken();
        if (API_URL && token) {
          await fetch(`${API_URL}/training/lessons/${lessonId}/complete`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ moduleId: module.id }),
          });
        }
        setCompletedLessons((prev) => new Set([...prev, lessonId]));
      } catch {
        setCompletedLessons((prev) => new Set([...prev, lessonId]));
      } finally {
        setMarking(false);
      }
    },
    [getToken, marking, module.id]
  );

  async function completeAndAdvance() {
    if (!lesson) return;
    await markLessonComplete(lesson.id);
    if (currentLesson < lessons.length - 1) {
      setCurrentLesson((i) => i + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goPrev() {
    if (currentLesson > 0) {
      setCurrentLesson((i) => i - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (!lesson) return null;

  const lessonDone = completedLessons.has(lesson.id) || passed;
  const showComplete = canComplete || lessonDone;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> {t("cleaner.training.backToAcademy")}
        </Button>
        <span className="text-xs font-medium text-slate-500">
          {t("cleaner.training.lesson", { current: currentLesson + 1, total: lessons.length })}
        </span>
      </div>

      {/* Module header */}
      <div className="rounded-2xl border border-seafoam-100 bg-seafoam-50 p-5 dark:border-seafoam-900/40 dark:bg-seafoam-950/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-seafoam-500 text-white">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-charcoal dark:text-white">{module.title}</h1>
            {module.estimated_minutes ? (
              <p className="text-xs text-slate-500">{module.estimated_minutes} min total</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* Lesson list sidebar */}
        <div className="space-y-1">
          {lessons.map((l, idx) => {
            const done = completedLessons.has(l.id) || passed;
            const active = idx === currentLesson;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setCurrentLesson(idx);
                  window.scrollTo({ top: 0 });
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  active
                    ? "bg-seafoam-100 font-semibold text-seafoam-700 dark:bg-seafoam-900/30 dark:text-seafoam-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs ${
                        active ? "border-seafoam-500 text-seafoam-600" : "border-slate-300 text-slate-400"
                      }`}
                    >
                      {idx + 1}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{l.title}</span>
              </button>
            );
          })}

          {module.requires_quiz && (
            <div
              className={`mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                allComplete || passed
                  ? "text-seafoam-700 dark:text-seafoam-300"
                  : "text-slate-400"
              }`}
            >
              <HelpCircle className="h-5 w-5 shrink-0" />
              <span>Module quiz</span>
            </div>
          )}
        </div>

        {/* Lesson content */}
        <div className="space-y-5">
          <Card>
            <div ref={contentRef}>
            <h1 className="mb-1 text-xl font-bold text-charcoal dark:text-white">{lesson.title}</h1>
            {lesson.estimated_minutes ? (
              <p className="mb-4 flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3 w-3" /> {lesson.estimated_minutes} min read
              </p>
            ) : null}
            <div
              className="lesson-content"
              // Content is authored internally in the training seed; safe to render.
              dangerouslySetInnerHTML={{ __html: lesson.body }}
            />
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={goPrev} disabled={currentLesson === 0}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>

            <div className="flex flex-col items-end gap-2">
              {currentLesson < lessons.length - 1 ? (
                <Button onClick={() => void completeAndAdvance()} loading={marking} disabled={!showComplete}>
                  {showComplete ? t("cleaner.training.nextLesson") : t("cleaner.training.keepReading")}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <>
                  {!lessonDone && (
                    <Button
                      onClick={() => void markLessonComplete(lesson.id)}
                      loading={marking}
                      disabled={!showComplete}
                    >
                      {showComplete ? t("cleaner.training.markComplete") : t("cleaner.training.keepReading")}
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  )}
                  {(allComplete || passed) && module.requires_quiz && (
                    <Button onClick={onStartQuiz} disabled={passed}>
                      {passed ? t("cleaner.training.quizPassed") : t("cleaner.training.takeQuiz")}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                  {passed && (
                    <p className="text-xs text-emerald-600">
                      You passed this module with {progress?.score}%.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Quiz (one question at a time) ──────────────────────────────────────────────

function Quiz({
  module,
  questions,
  passingScore,
  attemptCount,
  maxAttempts,
  onBack,
  onComplete,
  getToken,
}: {
  module: TrainingModule;
  questions: QuizQuestion[];
  passingScore: number;
  attemptCount: number;
  maxAttempts: number;
  onBack: () => void;
  onComplete: (results: QuizResult[], score: number, passed: boolean) => void;
  getToken: () => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const question = questions[current];
  const isLast = current === questions.length - 1;
  const allAnswered = Object.keys(answers).length === questions.length;
  const pct = Math.round(((current + 1) / questions.length) * 100);

  async function submitQuiz() {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/training/modules/${module.id}/quiz`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        toast.error("Failed to submit quiz. Please try again.");
        return;
      }
      const data = (await res.json()) as {
        score: number;
        passed: boolean;
        results: QuizResult[];
      };
      onComplete(data.results, data.score, data.passed);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!question) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> {t("cleaner.training.backToAcademy")}
        </Button>
        <span className="text-xs font-medium text-slate-500">
          {t("cleaner.training.passAttempt", { score: passingScore, current: attemptCount + 1, total: maxAttempts })}
        </span>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-sm font-medium text-charcoal dark:text-white">
          <span>
            {t("cleaner.training.questionOf", { current: current + 1, total: questions.length })}
          </span>
          <span className="text-seafoam-600">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-seafoam-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <Card>
        <p className="mb-5 text-lg font-semibold text-charcoal dark:text-white">{question.question}</p>
        <div className="space-y-2.5">
          {question.choices.map((choice, ci) => {
            const selected = answers[question.id] === choice;
            return (
              <button
                key={choice}
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, [question.id]: choice }))}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-all ${
                  selected
                    ? "border-seafoam-400 bg-seafoam-50 text-seafoam-700 ring-1 ring-seafoam-400 dark:bg-seafoam-900/20 dark:text-seafoam-300"
                    : "border-slate-200 bg-white text-charcoal hover:border-seafoam-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                    selected
                      ? "border-seafoam-500 bg-seafoam-500 text-white"
                      : "border-slate-300 text-slate-400"
                  }`}
                >
                  {String.fromCharCode(65 + ci)}
                </span>
                {choice}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => setCurrent((i) => Math.max(0, i - 1))}
          disabled={current === 0}
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {isLast ? (
          <Button
            onClick={() => void submitQuiz()}
            disabled={!allAnswered}
            loading={submitting}
          >
            {t("cleaner.training.submitQuiz")} <CheckCircle2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => setCurrent((i) => i + 1)} disabled={!answers[question.id]}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Quiz Result ───────────────────────────────────────────────────────────────

function QuizResultView({
  module,
  results,
  score,
  passed,
  passingScore,
  attemptsRemaining,
  onRetry,
  onBack,
  onNext,
  hasNext,
}: {
  module: TrainingModule;
  results: QuizResult[];
  score: number;
  passed: boolean;
  passingScore: number;
  attemptsRemaining: number;
  onRetry: () => void;
  onBack: () => void;
  onNext: () => void;
  hasNext: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {passed && <Confetti />}

      {/* Completion card */}
      <div
        className={`relative overflow-hidden rounded-2xl p-8 text-center text-white shadow-lg ${
          passed
            ? "bg-gradient-to-br from-seafoam-500 to-teal-700"
            : "bg-gradient-to-br from-slate-600 to-slate-800"
        }`}
      >
        <div className="relative flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur">
            {passed ? <Trophy className="h-9 w-9" /> : <AlertCircle className="h-9 w-9" />}
          </div>
          <h1 className="text-2xl font-bold">{passed ? t("cleaner.training.moduleComplete") : t("cleaner.training.notQuiteTitle")}</h1>
          <p className="text-5xl font-black tabular-nums">{score}%</p>
          <p className="text-sm text-white/80">
            {passed
              ? t("cleaner.training.youPassed", { title: module.title })
              : `${t("cleaner.training.needScore", { score: passingScore })} ${
                  attemptsRemaining > 0
                    ? `${attemptsRemaining} ${t("cleaner.training.attemptsRemaining")}.`
                    : "You have used all your attempts — please contact Sweepr support."
                }`}
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            {passed && hasNext && (
              <Button variant="secondary" onClick={onNext}>
                {t("common.next")} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            {passed && !hasNext && (
              <Button variant="secondary" onClick={onBack}>
                {t("cleaner.training.backToAcademy")} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            {!passed && attemptsRemaining > 0 && (
              <Button variant="secondary" onClick={onRetry}>
                <RefreshCw className="h-4 w-4" /> {t("cleaner.training.retryQuiz")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Per-question review */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("cleaner.training.reviewAnswers")}
        </h3>
        <div className="space-y-3">
          {results.map((r, idx) => (
            <div
              key={r.questionId}
              className={`rounded-2xl border p-4 ${
                r.isCorrect
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                  : "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20"
              }`}
            >
              <p className="mb-2 text-sm font-semibold text-charcoal dark:text-white">
                {idx + 1}. {r.question}
              </p>
              <div className="flex items-start gap-2 text-sm">
                {r.isCorrect ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                )}
                <div>
                  <p
                    className={
                      r.isCorrect
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-red-600 dark:text-red-400"
                    }
                  >
                    {t("cleaner.training.yourAnswer")} {r.submittedAnswer ?? "Not answered"}
                  </p>
                  {!r.isCorrect && (
                    <p className="text-emerald-700 dark:text-emerald-300">{t("cleaner.training.correct")} {r.correctAnswer}</p>
                  )}
                  {r.explanation && (
                    <p className="mt-1 text-slate-600 dark:text-slate-400">{r.explanation}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <Button variant="secondary" onClick={onBack}>
          {t("cleaner.training.backToAcademy")}
        </Button>
      </div>
    </div>
  );
}

// ─── Main TrainingPage ─────────────────────────────────────────────────────────

export function TrainingPage() {
  const { t } = useTranslation();
  const { moduleId: urlModuleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [view, setView] = useState<View>("list");
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [summary, setSummary] = useState<ProgressSummary>({
    totalRequired: 0,
    totalPassed: 0,
    allRequiredComplete: false,
    backgroundCheckUnlocked: false,
    trainingStatus: "not_started",
  });
  const [selectedModule, setSelectedModule] = useState<TrainingModule | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [moduleProgress, setModuleProgress] = useState<ModuleProgress | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizMeta, setQuizMeta] = useState({ passingScore: 80, maxAttempts: 3, attemptCount: 0 });
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [quizScore, setQuizScore] = useState(0);
  const [quizPassed, setQuizPassed] = useState(false);
  const [loading, setLoading] = useState(true);

  const authGetToken = useCallback(async () => {
    return await getToken();
  }, [getToken]);

  const loadModules = useCallback(async () => {
    try {
      const token = await authGetToken();
      const [modulesRes, progressRes] = await Promise.all([
        fetch(`${API_URL}/training/modules`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        }),
        fetch(`${API_URL}/training/progress`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        }),
      ]);
      if (modulesRes.ok) {
        const data = (await modulesRes.json()) as { modules: TrainingModule[] };
        setModules(data.modules);
      }
      if (progressRes.ok) {
        const data = (await progressRes.json()) as { summary: ProgressSummary };
        setSummary(data.summary);
      }
    } catch {
      // silently handle — show what we have
    } finally {
      setLoading(false);
    }
  }, [authGetToken]);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  const selectModule = useCallback(
    async (m: TrainingModule) => {
      setSelectedModule(m);
      try {
        const token = await authGetToken();
        const res = await fetch(`${API_URL}/training/modules/${m.id}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) {
          const data = (await res.json()) as {
            lessons: Lesson[];
            progress: ModuleProgress | null;
          };
          setLessons(data.lessons);
          setModuleProgress(data.progress);
        }
        if (!m.progress || m.progress.status === "not_started") {
          await fetch(`${API_URL}/training/modules/${m.id}/start`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token ?? ""}` },
          });
        }
      } catch {
        // silently handle
      }
      navigate(`/training/${m.id}`);
      setView("lessons");
      window.scrollTo({ top: 0 });
    },
    [authGetToken, navigate]
  );

  // Auto-open module if URL param present.
  useEffect(() => {
    if (urlModuleId && modules.length > 0 && selectedModule?.id !== urlModuleId) {
      const m = modules.find((mod) => mod.id === urlModuleId);
      if (m) void selectModule(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlModuleId, modules.length]);

  async function startQuiz() {
    if (!selectedModule) return;
    try {
      const token = await authGetToken();
      const res = await fetch(`${API_URL}/training/modules/${selectedModule.id}/quiz`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) {
        if (res.status === 403) {
          toast.error("You have used all your quiz attempts. Contact support.");
          return;
        }
        toast.error("Failed to load quiz.");
        return;
      }
      const data = (await res.json()) as {
        questions: QuizQuestion[];
        passingScore: number;
        maxAttempts: number;
        attemptCount: number;
      };
      setQuizQuestions(data.questions);
      setQuizMeta({
        passingScore: data.passingScore,
        maxAttempts: data.maxAttempts,
        attemptCount: data.attemptCount,
      });
      setView("quiz");
      window.scrollTo({ top: 0 });
    } catch {
      toast.error("Failed to load quiz.");
    }
  }

  function handleQuizComplete(results: QuizResult[], score: number, passed: boolean) {
    setQuizResults(results);
    setQuizScore(score);
    setQuizPassed(passed);
    setView("quiz-result");
    window.scrollTo({ top: 0 });
    if (passed) void loadModules();
  }

  function handleBack() {
    navigate("/training");
    setView("list");
    setSelectedModule(null);
    window.scrollTo({ top: 0 });
    void loadModules();
  }

  const nextModule = useMemo(() => {
    if (!selectedModule) return null;
    const ordered = [...modules].sort((a, b) => a.sort_order - b.sort_order);
    const idx = ordered.findIndex((m) => m.id === selectedModule.id);
    return idx >= 0 ? ordered[idx + 1] ?? null : null;
  }, [modules, selectedModule]);

  if (loading) {
    return (
      <DashboardShell title={t("cleaner.training.title")} description={t("common.loading")}>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      </DashboardShell>
    );
  }

  if (view === "lessons" && selectedModule) {
    return (
      <LessonViewer
        module={selectedModule}
        lessons={lessons}
        progress={moduleProgress}
        onBack={handleBack}
        onStartQuiz={() => void startQuiz()}
        getToken={authGetToken}
      />
    );
  }

  if (view === "quiz" && selectedModule) {
    return (
      <Quiz
        module={selectedModule}
        questions={quizQuestions}
        passingScore={quizMeta.passingScore}
        attemptCount={quizMeta.attemptCount}
        maxAttempts={quizMeta.maxAttempts}
        onBack={() => setView("lessons")}
        onComplete={handleQuizComplete}
        getToken={authGetToken}
      />
    );
  }

  if (view === "quiz-result" && selectedModule) {
    const atts = quizMeta.maxAttempts - quizMeta.attemptCount - 1;
    return (
      <QuizResultView
        module={selectedModule}
        results={quizResults}
        score={quizScore}
        passed={quizPassed}
        passingScore={quizMeta.passingScore}
        attemptsRemaining={Math.max(0, atts)}
        onRetry={() => void startQuiz()}
        onBack={handleBack}
        onNext={() => {
          if (nextModule) void selectModule(nextModule);
          else handleBack();
        }}
        hasNext={Boolean(nextModule)}
      />
    );
  }

  return <ModuleList modules={modules} summary={summary} onSelect={(m) => void selectModule(m)} />;
}

// Locked training gate component for use in onboarding/background check flows
export function TrainingGate({ unlocked }: { unlocked: boolean }) {
  const navigate = useNavigate();
  if (unlocked) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          Complete your required training first
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          You must complete all 10 required training modules before starting your background check.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => navigate("/training")}
        >
          <GraduationCap className="h-4 w-4" /> Go to Cleaner Academy
        </Button>
      </div>
    </div>
  );
}
