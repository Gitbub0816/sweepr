import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
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

function statusBadge(progress: ModuleProgress | null) {
  if (!progress || progress.status === "not_started") {
    return <Badge variant="default">Not started</Badge>;
  }
  if (progress.status === "passed") {
    return <Badge variant="success">Passed</Badge>;
  }
  if (progress.status === "failed") {
    return <Badge variant="error">Failed</Badge>;
  }
  if (progress.status === "in_progress") {
    return <Badge variant="info">In progress</Badge>;
  }
  return <Badge variant="default">{progress.status}</Badge>;
}

// ─── Module List ───────────────────────────────────────────────────────────────

function ModuleList({
  modules,
  summary,
  onSelect,
}: {
  modules: TrainingModule[];
  summary: ProgressSummary;
  onSelect: (m: TrainingModule) => void;
}) {
  const baseModules = modules.filter((m) => m.required_type === "base");
  const serviceModules = modules.filter((m) => m.required_type === "service_specific");
  const pct = summary.totalRequired > 0
    ? Math.round((summary.totalPassed / summary.totalRequired) * 100)
    : 0;

  return (
    <DashboardShell
      title="Training Academy"
      description="Complete all required modules to unlock your background check."
    >
      {/* Progress bar */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-seafoam-100 dark:bg-seafoam-900/30">
            <GraduationCap className="h-6 w-6 text-seafoam-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-charcoal dark:text-white">
                Required modules complete
              </span>
              <span className="text-sm font-bold text-seafoam-600">
                {summary.totalPassed}/{summary.totalRequired}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-seafoam-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
        {summary.allRequiredComplete && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            <Trophy className="h-5 w-5 shrink-0" />
            All required training complete! Your background check is now unlocked.
          </div>
        )}
      </Card>

      {/* Base modules */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Required Modules ({baseModules.length})
        </h2>
        <div className="space-y-2">
          {baseModules.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m)}
              className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-seafoam-300 hover:bg-seafoam-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-seafoam-600 dark:hover:bg-seafoam-950/20"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-seafoam-100 dark:bg-seafoam-900/30">
                {m.progress?.status === "passed" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : m.progress?.status === "failed" ? (
                  <XCircle className="h-5 w-5 text-red-500" />
                ) : (
                  <BookOpen className="h-5 w-5 text-seafoam-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-charcoal dark:text-white">
                  {m.title}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {statusBadge(m.progress)}
                  {m.estimated_minutes && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="h-3 w-3" />
                      {m.estimated_minutes} min
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          ))}
        </div>
      </div>

      {/* Service-specific */}
      {serviceModules.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Service-Specific Modules ({serviceModules.length})
          </h2>
          <div className="space-y-2">
            {serviceModules.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m)}
                className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-seafoam-300 hover:bg-seafoam-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-seafoam-600 dark:hover:bg-seafoam-950/20"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                  {m.progress?.status === "passed" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <BookOpen className="h-5 w-5 text-slate-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-charcoal dark:text-white">
                    {m.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {statusBadge(m.progress)}
                    {m.estimated_minutes && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        {m.estimated_minutes} min
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      )}
    </DashboardShell>
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

  const lesson = lessons[currentLesson];
  const allComplete = completedLessons.size >= lessons.length;
  const passed = progress?.status === "passed";

  async function markLessonComplete(lessonId: string) {
    if (!lesson || marking) return;
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
      // Silently continue — lesson completion is tracked server-side
    } finally {
      setMarking(false);
    }
  }

  function goNext() {
    if (lesson) {
      void markLessonComplete(lesson.id);
    }
    if (currentLesson < lessons.length - 1) {
      setCurrentLesson((i) => i + 1);
    }
  }

  function goPrev() {
    if (currentLesson > 0) setCurrentLesson((i) => i - 1);
  }

  if (!lesson) return null;

  return (
    <DashboardShell
      title={module.title}
      description={`Lesson ${currentLesson + 1} of ${lessons.length}`}
      actions={
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
      }
    >
      {/* Lesson list sidebar */}
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="space-y-1">
          {lessons.map((l, idx) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setCurrentLesson(idx)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                idx === currentLesson
                  ? "bg-seafoam-100 font-semibold text-seafoam-700 dark:bg-seafoam-900/30 dark:text-seafoam-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs">
                {completedLessons.has(l.id) || (progress?.last_lesson_id && idx < currentLesson) ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <span className={`h-4 w-4 rounded-full border-2 ${idx === currentLesson ? "border-seafoam-500" : "border-slate-300"}`} />
                )}
              </span>
              <span className="truncate">{l.title}</span>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 text-lg font-bold text-charcoal dark:text-white">
              {lesson.title}
            </h2>
            {lesson.estimated_minutes && (
              <p className="mb-4 flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3 w-3" /> {lesson.estimated_minutes} min read
              </p>
            )}
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {lesson.body.split("\n\n").map((para, i) => (
                <p key={i} className="mb-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {para}
                </p>
              ))}
            </div>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={goPrev} disabled={currentLesson === 0}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>

            {currentLesson < lessons.length - 1 ? (
              <Button onClick={goNext} loading={marking}>
                Next lesson <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex flex-col items-end gap-2">
                {!allComplete && (
                  <Button onClick={() => void markLessonComplete(lesson.id)} loading={marking}>
                    Mark complete <CheckCircle2 className="h-4 w-4" />
                  </Button>
                )}
                {(allComplete || passed) && module.requires_quiz && (
                  <Button
                    onClick={onStartQuiz}
                    disabled={passed && progress?.status === "passed"}
                  >
                    {passed ? "Quiz passed ✓" : "Take the quiz →"}
                  </Button>
                )}
                {passed && (
                  <p className="text-xs text-emerald-600">
                    You passed this module with {progress?.score}%.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

// ─── Quiz ──────────────────────────────────────────────────────────────────────

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
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length;

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

  return (
    <DashboardShell
      title={`Quiz: ${module.title}`}
      description={`Answer all ${questions.length} questions. Passing score: ${passingScore}% · Attempt ${attemptCount + 1} of ${maxAttempts}`}
      actions={
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> Back to lessons
        </Button>
      }
    >
      <div className="space-y-6">
        {questions.map((q, idx) => (
          <Card key={q.id}>
            <p className="mb-4 font-semibold text-charcoal dark:text-white">
              {idx + 1}. {q.question}
            </p>
            <div className="space-y-2">
              {q.choices.map((choice) => {
                const selected = answers[q.id] === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: choice }))}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                      selected
                        ? "border-seafoam-400 bg-seafoam-50 text-seafoam-700 ring-1 ring-seafoam-400 dark:bg-seafoam-900/20 dark:text-seafoam-300"
                        : "border-slate-200 bg-white text-charcoal hover:border-seafoam-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    }`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-seafoam-500 bg-seafoam-500" : "border-slate-300"}`}>
                      {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                    </span>
                    {choice}
                  </button>
                );
              })}
            </div>
          </Card>
        ))}

        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {answeredCount}/{questions.length} answered
          </p>
          <Button
            onClick={() => void submitQuiz()}
            disabled={!allAnswered}
            loading={submitting}
          >
            Submit quiz
          </Button>
        </div>
      </div>
    </DashboardShell>
  );
}

// ─── Quiz Result ───────────────────────────────────────────────────────────────

function QuizResult({
  module,
  results,
  score,
  passed,
  passingScore,
  attemptsRemaining,
  onRetry,
  onBack,
}: {
  module: TrainingModule;
  results: QuizResult[];
  score: number;
  passed: boolean;
  passingScore: number;
  attemptsRemaining: number;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <DashboardShell
      title={passed ? "Quiz Passed!" : "Quiz Complete"}
      description={`You scored ${score}% — passing score is ${passingScore}%`}
    >
      <Card>
        <div className={`mb-6 flex items-center gap-4 rounded-xl p-4 ${passed ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
          {passed ? (
            <Trophy className="h-8 w-8 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-8 w-8 shrink-0 text-red-500" />
          )}
          <div>
            <p className={`text-lg font-bold ${passed ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
              {passed ? `Great job! You passed with ${score}%.` : `You scored ${score}%. You need ${passingScore}% to pass.`}
            </p>
            {!passed && attemptsRemaining > 0 && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining.
              </p>
            )}
            {!passed && attemptsRemaining === 0 && (
              <p className="text-sm text-red-600 dark:text-red-400">
                You have used all your attempts. Please contact Sweepr support.
              </p>
            )}
          </div>
        </div>

        <h3 className="mb-4 font-semibold text-charcoal dark:text-white">Review your answers</h3>
        <div className="space-y-4">
          {results.map((r, idx) => (
            <div
              key={r.questionId}
              className={`rounded-xl border p-4 ${r.isCorrect ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20" : "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20"}`}
            >
              <p className="mb-2 text-sm font-semibold text-charcoal dark:text-white">
                {idx + 1}. {r.question}
              </p>
              <div className="flex items-start gap-2">
                {r.isCorrect ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                )}
                <div className="text-sm">
                  <p className={r.isCorrect ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}>
                    Your answer: {r.submittedAnswer ?? "Not answered"}
                  </p>
                  {!r.isCorrect && (
                    <p className="text-emerald-700 dark:text-emerald-300">
                      Correct: {r.correctAnswer}
                    </p>
                  )}
                  {r.explanation && (
                    <p className="mt-1 text-slate-600 dark:text-slate-400">{r.explanation}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onBack}>
            Back to modules
          </Button>
          {!passed && attemptsRemaining > 0 && (
            <Button onClick={onRetry}>
              <RefreshCw className="h-4 w-4" /> Retry quiz
            </Button>
          )}
        </div>
      </Card>
    </DashboardShell>
  );
}

// ─── Main TrainingPage ─────────────────────────────────────────────────────────

export function TrainingPage() {
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

  // Auto-open module if URL param present
  useEffect(() => {
    if (urlModuleId && modules.length > 0) {
      const m = modules.find((mod) => mod.id === urlModuleId);
      if (m) void selectModule(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlModuleId, modules.length]);

  async function selectModule(m: TrainingModule) {
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

      // Start module progress if not started
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
  }

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
    } catch {
      toast.error("Failed to load quiz.");
    }
  }

  function handleQuizComplete(results: QuizResult[], score: number, passed: boolean) {
    setQuizResults(results);
    setQuizScore(score);
    setQuizPassed(passed);
    setView("quiz-result");
    if (passed) {
      void loadModules(); // Refresh module list to update completion counts
    }
  }

  function handleBack() {
    navigate("/training");
    setView("list");
    setSelectedModule(null);
    void loadModules();
  }

  if (loading) {
    return (
      <DashboardShell title="Training Academy" description="Loading your training modules...">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
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
      <QuizResult
        module={selectedModule}
        results={quizResults}
        score={quizScore}
        passed={quizPassed}
        passingScore={quizMeta.passingScore}
        attemptsRemaining={Math.max(0, atts)}
        onRetry={() => void startQuiz()}
        onBack={handleBack}
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
          <GraduationCap className="h-4 w-4" /> Go to Training Academy
        </Button>
      </div>
    </div>
  );
}
