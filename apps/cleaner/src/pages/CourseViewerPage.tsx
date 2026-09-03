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
 * Course player (Course Builder v2) — the learner side of the interactive
 * block layer.
 *
 * Server-authoritative by design: the API serves LOCALIZED, SANITIZED props
 * (answer keys and feedback never reach this client — see
 * sanitizeCourseBlockPropsForLearner in @sweepr/utils), every interactive
 * block submits to POST /courses/:id/respond and renders the verdict the
 * server returns, and a pass/fail course (settings.passingScorePct)
 * completes only through POST /courses/:id/finish.
 *
 * Mobile-first: below md the 16:9 canvas reflows into a vertical stack
 * (sorted by y), every interaction is tap-based with large targets (tap
 * item → tap category; arrow buttons for ordering; tap-to-pair matching),
 * and nothing requires hover or precision dragging.
 *
 * Localized twice over: the chrome through i18next (en/es keys, en
 * fallback elsewhere), the CONTENT through the course's own supported
 * locales — one course record, per-locale overlays, progress counted once.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAppToken } from "@/lib/appToken";
import {
  COURSE_CALLOUT_STYLES,
  courseChecklistItems,
  courseStyleCss,
  courseText,
} from "@sweepr/utils";
import {
  AlertTriangle, BookOpen, Calendar, Camera, Check, CheckCircle2, ChevronLeft,
  ChevronRight, ChevronUp, ChevronDown, Clock, DollarSign, FileText,
  Headphones, Home, Info, ListChecks, Lock, MapPin, Phone, RotateCcw, Shield,
  ShieldCheck, Sparkles, Star, User, UserCheck, XCircle,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "https://api.getsweepr.com";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Block {
  id: string;
  block_type: string;
  x: number; y: number; width: number; height: number; z_index: number;
  props: Record<string, unknown>;
}
interface Slide {
  id: string;
  title: string | null;
  slide_type: string;
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
interface AssessmentSettings {
  passingScorePct?: number | null;
  maxAttempts?: number | null;
  shuffleQuestions?: boolean;
  shuffleAnswers?: boolean;
  showScore?: boolean;
  showExplanations?: boolean;
}
interface RespondResult {
  correct: boolean;
  scorePct: number;
  feedback: string | null;
  explanation: string | null;
  detail: Record<string, unknown> | null;
  canRetry: boolean;
}
interface FinishResult {
  passed: boolean;
  scorePct: number | null;
  correctCount: number;
  totalCount: number;
  attempt: number;
  attemptsLeft: number | null;
}

const ICONS: Record<string, typeof Check> = {
  calendar: Calendar, clock: Clock, location: MapPin, money: DollarSign,
  shield: Shield, camera: Camera, warning: AlertTriangle, checklist: ListChecks,
  home: Home, customer: User, cleaner: UserCheck, support: Headphones,
  insurance: ShieldCheck, document: FileText, sparkle: Sparkles, star: Star,
  info: Info, check: Check, phone: Phone, lock: Lock,
};

const LOCALE_LABELS: Record<string, string> = {
  en: "English", es: "Español", ar: "العربية", fil: "Filipino", hi: "हिन्दी",
  ko: "한국어", pt: "Português", vi: "Tiếng Việt", "zh-Hans": "简体中文", "zh-Hant": "繁體中文",
};

// Content-language strings that must follow the COURSE locale (not the app
// chrome language) for the few labels the schema doesn't carry.
const CONTENT_STRINGS: Record<string, { true_: string; false_: string }> = {
  en: { true_: "True", false_: "False" },
  es: { true_: "Verdadero", false_: "Falso" },
};
const contentStrings = (locale: string) => CONTENT_STRINGS[locale] ?? CONTENT_STRINGS.en;

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export function CourseViewerPage() {
  const { id } = useParams<{ id: string }>();
  return id ? <CoursePlayer courseId={id} /> : <CourseLibrary />;
}

// ─── Library ──────────────────────────────────────────────────────────────────

function CourseLibrary() {
  const { t, i18n } = useTranslation();
  const { getToken } = useAppToken();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch(`${API}/courses?locale=${encodeURIComponent(i18n.language)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setCourses((await res.json()).courses ?? []);
      setLoading(false);
    })();
  }, [getToken, i18n.language]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">{t("cleaner.courses.title")}</h1>
      <p className="text-sm text-slate-500 mb-6">{t("cleaner.courses.subtitle")}</p>
      {loading ? (
        <p className="text-slate-600 text-sm">{t("common.loading", "Loading…")}</p>
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">
          {t("cleaner.courses.empty")}
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
  const { t, i18n } = useTranslation();
  const { getToken } = useAppToken();
  const navigate = useNavigate();
  const isNarrow = useIsNarrow();

  const [title, setTitle] = useState("");
  const [versionId, setVersionId] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [settings, setSettings] = useState<AssessmentSettings>({});
  const [supportedLocales, setSupportedLocales] = useState<string[]>(["en"]);
  const [locale, setLocale] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(1);
  const [results, setResults] = useState<Record<string, RespondResult>>({});
  const [index, setIndex] = useState(0);
  const [finish, setFinish] = useState<FinishResult | null>(null);
  const [finishing, setFinishing] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(async (loc: string | null) => {
    const token = await getToken();
    const q = loc ? `?locale=${encodeURIComponent(loc)}` : "";
    const res = await fetch(`${API}/courses/${courseId}${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setTitle(data.course.title);
    setVersionId(data.version_id);
    setSlides(data.slides ?? []);
    setSettings(data.settings ?? {});
    setSupportedLocales(Array.isArray(data.course.supported_locales) ? data.course.supported_locales : ["en"]);
    setLocale(data.course.locale ?? null);
    setAttempt(data.progress?.attempt ?? 1);
    if (!loadedOnce.current) {
      // Resume: verdicts recorded earlier in this attempt keep their gates
      // open. Full feedback returns the next time the learner answers.
      const seeded: Record<string, RespondResult> = {};
      for (const [blockId, r] of Object.entries((data.progress?.responses ?? {}) as Record<string, { correct: boolean; scorePct: number | null }>)) {
        seeded[blockId] = { correct: r.correct, scorePct: r.scorePct ?? (r.correct ? 100 : 0), feedback: null, explanation: null, detail: null, canRetry: !r.correct };
      }
      setResults(seeded);
      loadedOnce.current = true;
    }
  }, [courseId, getToken]);

  useEffect(() => {
    // First load follows the app language; the in-player toggle refetches.
    load(i18n.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const switchLocale = useCallback((loc: string) => {
    load(loc);
  }, [load]);

  const reportProgress = useCallback(async (percent: number, slideId?: string) => {
    if (!versionId) return;
    const token = await getToken();
    await fetch(`${API}/courses/${courseId}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ course_version_id: versionId, progress_percent: percent, completed: false, slide_id: slideId }),
    });
  }, [courseId, getToken, versionId]);

  const respond = useCallback(async (blockId: string, response: Record<string, unknown>): Promise<RespondResult | null> => {
    const token = await getToken();
    const res = await fetch(`${API}/courses/${courseId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ course_version_id: versionId, block_id: blockId, response, locale: locale ?? undefined }),
    });
    if (!res.ok) return null;
    const result = (await res.json()) as RespondResult;
    setResults((prev) => ({ ...prev, [blockId]: result }));
    return result;
  }, [courseId, getToken, versionId, locale]);

  const retryBlock = useCallback((blockId: string) => {
    setResults((prev) => {
      const next = { ...prev };
      delete next[blockId];
      return next;
    });
  }, []);

  // Assessment-slide shuffling (per attempt) when the version asks for it.
  const orderedSlides = useMemo(() => {
    if (!settings.shuffleQuestions) return slides;
    const fixed = slides.filter((s) => s.slide_type !== "assessment");
    const assessment = slides.filter((s) => s.slide_type === "assessment");
    for (let i = assessment.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [assessment[i], assessment[j]] = [assessment[j], assessment[i]];
    }
    // Reassemble: assessment slides take the positions assessment slides held.
    const out: Slide[] = [];
    let ai = 0;
    for (const s of slides) out.push(s.slide_type === "assessment" ? assessment[ai++] : fixed.shift()!);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, settings.shuffleQuestions, attempt]);

  const slide = orderedSlides[index];
  const isAssessed = settings.passingScorePct !== undefined && settings.passingScorePct !== null;

  // mustPass blocks lock Next until answered correctly.
  const gated = useMemo(() => {
    if (!slide) return false;
    return slide.blocks.some((b) => b.props.mustPass === true && !results[b.id]?.correct);
  }, [slide, results]);

  const doFinish = useCallback(async () => {
    setFinishing(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/courses/${courseId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ course_version_id: versionId }),
      });
      if (res.ok) setFinish((await res.json()) as FinishResult);
    } finally {
      setFinishing(false);
    }
  }, [courseId, getToken, versionId]);

  const next = useCallback(() => {
    if (gated) return;
    if (index < orderedSlides.length - 1) {
      const ni = index + 1;
      setIndex(ni);
      reportProgress(Math.round((ni / orderedSlides.length) * 100), orderedSlides[ni]?.id);
    } else {
      doFinish();
    }
  }, [gated, index, orderedSlides, reportProgress, doFinish]);

  const retake = useCallback(() => {
    setResults({});
    setFinish(null);
    setAttempt((a) => a + 1);
    setIndex(0);
  }, []);

  if (!slide && !finish) {
    return <div className="grid min-h-[60vh] place-items-center text-slate-600 text-sm">{t("cleaner.courses.loading")}</div>;
  }

  if (finish) {
    const showScore = settings.showScore !== false && finish.scorePct !== null;
    const canRetake = !finish.passed && (finish.attemptsLeft === null || finish.attemptsLeft > 0);
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="max-w-sm text-center">
          {finish.passed ? (
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          ) : (
            <XCircle className="mx-auto h-14 w-14 text-amber-500" />
          )}
          <h2 className="mt-4 text-xl font-bold text-slate-900">
            {finish.passed ? t("cleaner.courses.complete") : t("cleaner.courses.notPassed")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{title}</p>
          {showScore && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-3xl font-bold text-slate-900">{finish.scorePct}%</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {t("cleaner.courses.resultsCorrect", { correct: finish.correctCount, total: finish.totalCount })}
              </div>
              {isAssessed && (
                <div className="mt-1 text-xs text-slate-500">
                  {t("cleaner.courses.passMark", { pct: settings.passingScorePct })}
                </div>
              )}
            </div>
          )}
          {!finish.passed && finish.attemptsLeft !== null && finish.attemptsLeft > 0 && (
            <p className="mt-3 text-xs text-slate-500">{t("cleaner.courses.attemptsLeft", { count: finish.attemptsLeft })}</p>
          )}
          {!finish.passed && finish.attemptsLeft === 0 && (
            <p className="mt-3 text-sm text-amber-700">{t("cleaner.courses.noAttemptsLeft")}</p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            {canRetake && (
              <button onClick={retake} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <RotateCcw className="h-4 w-4" /> {t("cleaner.courses.retake")}
              </button>
            )}
            <button onClick={() => navigate("/courses")} className="rounded-lg bg-seafoam-700 px-5 py-2 text-sm font-semibold text-white hover:bg-seafoam-800">
              {t("cleaner.courses.backToCourses")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const localeChoices = supportedLocales.filter((l) => LOCALE_LABELS[l]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button onClick={() => navigate("/courses")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft className="h-4 w-4" /> {t("cleaner.courses.exit")}
        </button>
        <div className="flex items-center gap-3">
          {localeChoices.length > 1 && (
            <div className="flex overflow-hidden rounded-full border border-slate-200 text-xs">
              {localeChoices.map((l) => (
                <button
                  key={l}
                  onClick={() => switchLocale(l)}
                  className={`px-3 py-1 font-medium ${locale === l ? "bg-seafoam-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
          )}
          <span className="text-xs text-slate-600">{index + 1} / {orderedSlides.length}</span>
        </div>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-seafoam-500 transition-all" style={{ width: `${((index + 1) / orderedSlides.length) * 100}%` }} />
      </div>

      {isNarrow ? (
        /* Mobile reflow: blocks stack top-to-bottom in reading order with
           natural heights and full-width touch targets. */
        <div
          className="rounded-2xl bg-white p-4 shadow-lg space-y-4"
          style={{ background: (slide.background?.color as string) ?? "#ffffff" }}
        >
          {[...slide.blocks]
            .filter((b) => !["shape", "divider", "spacer"].includes(b.block_type))
            .sort((a, b) => a.y - b.y || a.x - b.x)
            .map((b) => (
              <LearnerBlock
                key={`${b.id}:${attempt}`}
                block={b}
                stacked
                result={results[b.id]}
                settings={settings}
                locale={locale ?? "en"}
                onRespond={respond}
                onRetry={retryBlock}
                onNext={next}
                onPrev={() => setIndex((i) => Math.max(0, i - 1))}
                onComplete={doFinish}
              />
            ))}
        </div>
      ) : (
        <div
          className="relative mx-auto aspect-video w-full overflow-hidden rounded-2xl bg-white shadow-lg"
          style={{ background: (slide.background?.color as string) ?? "#ffffff" }}
        >
          {slide.blocks.map((b) => (
            <div key={`${b.id}:${attempt}`} className="absolute"
              style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.width}%`, height: `${b.height}%`, zIndex: b.z_index }}>
              <LearnerBlock
                block={b}
                stacked={false}
                result={results[b.id]}
                settings={settings}
                locale={locale ?? "en"}
                onRespond={respond}
                onRetry={retryBlock}
                onNext={next}
                onPrev={() => setIndex((i) => Math.max(0, i - 1))}
                onComplete={doFinish}
              />
            </div>
          ))}
        </div>
      )}

      {gated && (
        <p className="mt-3 text-center text-xs font-medium text-amber-700">{t("cleaner.courses.answerToContinue")}</p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="flex min-h-11 items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> {t("cleaner.courses.back")}
        </button>
        <button
          onClick={next}
          disabled={gated || finishing}
          className="flex min-h-11 items-center gap-1 rounded-lg bg-seafoam-700 px-5 py-2 text-sm font-semibold text-white hover:bg-seafoam-800 disabled:opacity-40"
        >
          {index === orderedSlides.length - 1 ? t("cleaner.courses.finish") : t("cleaner.courses.next")} <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Shared block chrome ─────────────────────────────────────────────────────

interface BlockCtx {
  block: Block;
  stacked: boolean;
  result?: RespondResult;
  settings: AssessmentSettings;
  locale: string;
  onRespond: (blockId: string, response: Record<string, unknown>) => Promise<RespondResult | null>;
  onRetry: (blockId: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onComplete: () => void;
}

function FeedbackPanel({ result, onRetry, t }: { result: RespondResult; onRetry: () => void; t: (k: string) => string }) {
  return (
    <div
      className={`mt-3 rounded-lg border p-3 text-sm ${
        result.correct ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <div className="flex items-center gap-1.5 font-semibold">
        {result.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {result.correct ? t("cleaner.courses.correct") : t("cleaner.courses.incorrect")}
      </div>
      {result.feedback && <p className="mt-1">{result.feedback}</p>}
      {result.explanation && (result.correct || !result.canRetry) && (
        <p className="mt-1 text-xs opacity-80">{result.explanation}</p>
      )}
      {result.canRetry && (
        <button onClick={onRetry} className="mt-2 flex min-h-9 items-center gap-1 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
          <RotateCcw className="h-3.5 w-3.5" /> {t("cleaner.courses.tryAgain")}
        </button>
      )}
    </div>
  );
}

function CheckButton({ disabled, busy, onClick, t }: { disabled: boolean; busy: boolean; onClick: () => void; t: (k: string) => string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="mt-3 min-h-10 rounded-lg bg-seafoam-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-seafoam-800 disabled:opacity-40"
    >
      {t("cleaner.courses.check")}
    </button>
  );
}

/** Wraps an interactive block: container styling + scroll + feedback. */
function InteractiveShell({ block, stacked, children }: { block: Block; stacked: boolean; children: React.ReactNode }) {
  const css = courseStyleCss(block.props.style);
  return (
    <div
      className={`${stacked ? "" : "h-full w-full overflow-auto"} rounded-xl border border-slate-200 bg-white p-3`}
      style={css as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/** Stable per-mount option shuffle when the version asks for shuffleAnswers. */
function useDisplayOrder(count: number, shuffle: boolean): number[] {
  return useMemo(() => {
    const idx = Array.from({ length: count }, (_, i) => i);
    if (!shuffle) return idx;
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, shuffle]);
}

// ─── The block switch ────────────────────────────────────────────────────────

function LearnerBlock(ctx: BlockCtx) {
  const { block } = ctx;
  switch (block.block_type) {
    case "heading":
    case "text":
      return <TextBlock {...ctx} />;
    case "shape":
      return <ShapeBlock block={block} />;
    case "divider":
      return <div className="w-full" style={{ borderTop: `${(block.props.thickness as number) ?? 2}px solid ${(block.props.color as string) ?? "#cbd5e1"}`, marginTop: ctx.stacked ? 0 : "50%" }} />;
    case "spacer":
      return null;
    case "callout":
      return <CalloutBlock {...ctx} />;
    case "embed":
      return (block.props.url as string) ? (
        <iframe title="embed" src={block.props.url as string} className={ctx.stacked ? "aspect-video w-full rounded-lg" : "h-full w-full rounded-lg"} allowFullScreen />
      ) : null;
    case "image":
      return <ImageBlock {...ctx} />;
    case "video":
      return (block.props.streamId as string) ? (
        <iframe
          title="training video"
          className={ctx.stacked ? "aspect-video w-full rounded-lg" : "h-full w-full rounded-lg"}
          src={`https://iframe.videodelivery.net/${block.props.streamId as string}`}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
        />
      ) : (
        <div className={`grid place-items-center rounded-lg bg-slate-900 text-xs text-slate-300 ${ctx.stacked ? "aspect-video w-full" : "h-full w-full"}`}>No video</div>
      );
    case "button":
      return <ActionButtonBlock {...ctx} />;
    case "checklist":
      return <ChecklistBlock {...ctx} />;
    case "timeline":
      return <TimelineBlock {...ctx} />;
    case "before_after":
      return <BeforeAfterBlock {...ctx} />;
    case "acknowledgment":
      return <AckBlock {...ctx} />;
    case "true_false":
      return <TrueFalseBlock {...ctx} />;
    case "quiz":
      return <QuizBlock {...ctx} />;
    case "image_choice":
      return <ImageChoiceBlock {...ctx} />;
    case "sort":
      return <SortBlock {...ctx} />;
    case "order":
      return <OrderBlock {...ctx} />;
    case "matching":
      return <MatchingBlock {...ctx} />;
    case "hotspot":
      return <HotspotBlock {...ctx} />;
    case "scenario":
      return <ScenarioBlock {...ctx} />;
    default:
      return null;
  }
}

// ─── Static blocks ───────────────────────────────────────────────────────────

function TextBlock({ block, stacked }: BlockCtx) {
  const p = block.props;
  const css = courseStyleCss(p.style);
  return (
    <div
      className={`${stacked ? "" : "h-full w-full"} overflow-hidden whitespace-pre-wrap`}
      style={{
        fontSize: `${(p.size as number) ?? 18}px`,
        fontWeight: (p.weight as number) ?? (block.block_type === "heading" ? 700 : 400),
        color: (p.color as string) ?? "#0f172a",
        textAlign: (p.align as "left") ?? "left",
        fontFamily: (p.font as string) ?? "Inter",
        fontStyle: p.italic ? "italic" : "normal",
        textDecoration: p.underline ? "underline" : "none",
        lineHeight: (p.lineHeight as number) ?? 1.3,
        ...(css as React.CSSProperties),
      }}
    >
      {courseText(p.content)}
    </div>
  );
}

function ShapeBlock({ block }: { block: Block }) {
  const p = block.props;
  const isEllipse = p.shape === "ellipse";
  if (p.shape === "line") {
    return <div className="w-full" style={{ height: 0, borderTop: `${(p.border as number) || 3}px solid ${(p.fill as string) ?? "#2DD4BF"}`, marginTop: "50%" }} />;
  }
  return (
    <div className="h-full w-full" style={{
      background: (p.fill as string) ?? "#2DD4BF",
      borderRadius: isEllipse ? "50%" : `${(p.radius as number) ?? 12}px`,
      border: (p.border as number) ? `${p.border}px solid ${(p.borderColor as string) ?? "#0f766e"}` : undefined,
      opacity: (p.opacity as number) ?? 1,
    }} />
  );
}

function CalloutBlock({ block, stacked }: BlockCtx) {
  const p = block.props;
  const st = COURSE_CALLOUT_STYLES[(p.variant as string) ?? "info"] ?? COURSE_CALLOUT_STYLES.info;
  const css = courseStyleCss(p.style);
  const Icon = typeof (p.style as Record<string, unknown>)?.icon === "string" ? ICONS[(p.style as Record<string, unknown>).icon as string] : undefined;
  return (
    <div
      className={`${stacked ? "" : "h-full w-full overflow-auto"} rounded-lg p-3`}
      style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.text, ...(css as React.CSSProperties) }}
    >
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        {Icon && <Icon className="h-4 w-4" />}
        {courseText(p.title) || "Note"}
      </div>
      <div className="mt-0.5 text-xs">{courseText(p.body)}</div>
    </div>
  );
}

function ImageBlock({ block, stacked }: BlockCtx) {
  const p = block.props;
  if (!(p.url as string)) return null;
  const annotations = Array.isArray(p.annotations) ? (p.annotations as Array<Record<string, unknown>>) : [];
  const img = (
    <img
      src={p.url as string}
      alt={courseText(p.alt) || courseText(p.caption)}
      className={stacked ? "w-full" : "h-full w-full"}
      style={{
        objectFit: (p.fit as "cover") ?? "cover",
        objectPosition: (p.position as string) ?? "center",
        borderRadius: `${(p.radius as number) ?? 12}px`,
      }}
    />
  );
  const body = (
    <div className={stacked ? "relative w-full" : "relative h-full w-full"}>
      {img}
      {annotations.map((a, i) => {
        const label = courseText(a.label);
        if (a.kind === "box") {
          return (
            <div key={i} className="absolute rounded border-2 border-amber-400 bg-amber-300/10"
              style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${(a.width as number) ?? 10}%`, height: `${(a.height as number) ?? 10}%` }}>
              {label && <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-amber-400 px-1 text-[10px] font-semibold text-amber-950">{label}</span>}
            </div>
          );
        }
        if (a.kind === "arrow") {
          return (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${a.x}%`, top: `${a.y}%` }}>
              <div className="flex items-center gap-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                ↘ {label}
              </div>
            </div>
          );
        }
        return (
          <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${a.x}%`, top: `${a.y}%` }}>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-seafoam-600 text-xs font-bold text-white shadow">
              {typeof a.n === "number" ? a.n : i + 1}
            </span>
            {label && <span className="absolute left-7 top-0.5 whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-800 shadow">{label}</span>}
          </div>
        );
      })}
      {courseText(p.caption) && (
        <div className="mt-1 text-center text-xs text-slate-500">{courseText(p.caption)}</div>
      )}
    </div>
  );
  return (p.href as string) ? (
    <a href={p.href as string} target="_blank" rel="noreferrer" className={stacked ? "block w-full" : "block h-full w-full"}>{body}</a>
  ) : body;
}

function ActionButtonBlock({ block, stacked, onNext, onPrev, onComplete }: BlockCtx) {
  const p = block.props;
  const css = courseStyleCss(p.style);
  const action = (p.action as string) ?? "next";
  const onClick = () => {
    if (action === "next") onNext();
    else if (action === "prev") onPrev();
    else if (action === "complete") onComplete();
    else if (action === "url" && typeof p.url === "string" && p.url) window.open(p.url, "_blank", "noopener");
  };
  return (
    <button
      onClick={onClick}
      className={`${stacked ? "w-full" : "h-full w-full"} grid min-h-11 place-items-center rounded-lg text-sm font-semibold text-white`}
      style={{ background: (p.color as string) ?? "#14b8a6", ...(css as React.CSSProperties) }}
    >
      {courseText(p.label) || "Next"}
    </button>
  );
}

function ChecklistBlock({ block, stacked }: BlockCtx) {
  const items = courseChecklistItems(block.props.items);
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const css = courseStyleCss(block.props.style);
  return (
    <div className={`${stacked ? "" : "h-full w-full overflow-auto"} rounded-lg bg-slate-50 p-3 text-sm text-slate-700`} style={css as React.CSSProperties}>
      {items.map((it, i) => (
        <label key={i} className="flex min-h-9 cursor-pointer items-center gap-2 py-0.5">
          <input
            type="checkbox"
            checked={checked[i] ?? false}
            onChange={() => setChecked((prev) => prev.map((v, vi) => (vi === i ? !v : v)))}
            className="h-4 w-4 accent-teal-600"
          />
          <span className={checked[i] ? "line-through opacity-60" : ""}>{it}</span>
        </label>
      ))}
    </div>
  );
}

function TimelineBlock({ block, stacked }: BlockCtx) {
  const p = block.props;
  const steps = Array.isArray(p.steps) ? (p.steps as Array<Record<string, unknown>>) : [];
  const vertical = stacked || p.orientation === "vertical";
  const css = courseStyleCss(p.style);
  return (
    <div className={`${stacked ? "" : "h-full w-full overflow-auto"}`} style={css as React.CSSProperties}>
      <div className={vertical ? "flex flex-col gap-0" : "flex items-start gap-0 overflow-x-auto"}>
        {steps.map((s, i) => {
          const Icon = typeof s.icon === "string" ? ICONS[s.icon] : undefined;
          return (
            <div key={i} className={vertical ? "flex gap-3" : "flex min-w-28 flex-1 flex-col items-center text-center"}>
              <div className={vertical ? "flex flex-col items-center" : "flex w-full items-center"}>
                {!vertical && i > 0 && <div className="h-0.5 flex-1 bg-seafoam-200" />}
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-seafoam-600 text-white shadow-sm">
                  {Icon ? <Icon className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                </div>
                {!vertical && i < steps.length - 1 && <div className="h-0.5 flex-1 bg-seafoam-200" />}
                {vertical && i < steps.length - 1 && <div className="min-h-6 w-0.5 flex-1 bg-seafoam-200" />}
              </div>
              <div className={vertical ? "pb-4" : "mt-1.5 px-1"}>
                <div className="text-xs font-semibold text-slate-900">{courseText(s.title)}</div>
                {courseText(s.description) && <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{courseText(s.description)}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BeforeAfterBlock({ block, stacked }: BlockCtx) {
  const { t } = useTranslation();
  const p = block.props;
  const [pos, setPos] = useState(50);
  const radius = `${(p.radius as number) ?? 12}px`;
  const beforeLabel = courseText(p.beforeLabel) || t("cleaner.courses.beforeLabel");
  const afterLabel = courseText(p.afterLabel) || t("cleaner.courses.afterLabel");
  if (!(p.beforeUrl as string) || !(p.afterUrl as string)) return null;

  if (p.mode === "side_by_side") {
    return (
      <div className={`${stacked ? "" : "h-full w-full"} grid grid-cols-2 gap-2`}>
        {([[p.beforeUrl, beforeLabel], [p.afterUrl, afterLabel]] as Array<[unknown, string]>).map(([url, label], i) => (
          <div key={i} className="relative">
            <img src={url as string} alt={label} className={stacked ? "w-full" : "h-full w-full object-cover"} style={{ borderRadius: radius }} />
            <span className="absolute left-2 top-2 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`relative ${stacked ? "aspect-video w-full" : "h-full w-full"} select-none overflow-hidden`} style={{ borderRadius: radius }}>
      <img src={p.afterUrl as string} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
        <img src={p.beforeUrl as string} alt={beforeLabel} className="h-full object-cover" style={{ width: `${100 * (100 / Math.max(pos, 1))}%`, maxWidth: "none" }} />
      </div>
      <div className="absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="h-full w-0.5 bg-white shadow" />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-1 shadow">
          <ChevronLeft className="inline h-3 w-3 text-slate-600" /><ChevronRight className="inline h-3 w-3 text-slate-600" />
        </div>
      </div>
      <span className="absolute left-2 top-2 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{beforeLabel}</span>
      <span className="absolute right-2 top-2 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{afterLabel}</span>
      <input
        type="range" min={0} max={100} value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label={`${beforeLabel} / ${afterLabel}`}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}

// ─── Interactive blocks ──────────────────────────────────────────────────────

function AckBlock({ block, stacked, result, onRespond }: BlockCtx) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const done = result?.correct === true;
  return (
    <InteractiveShell block={block} stacked={stacked}>
      <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${done ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
        <input
          type="checkbox"
          checked={done}
          disabled={done || busy}
          onChange={async () => {
            setBusy(true);
            await onRespond(block.id, { acknowledged: true });
            setBusy(false);
          }}
          className="h-5 w-5 accent-teal-600"
        />
        <span>{courseText(block.props.statement) || t("cleaner.courses.acknowledge")}</span>
        {done && <span className="ml-auto text-xs font-semibold">{t("cleaner.courses.acknowledged")}</span>}
      </label>
    </InteractiveShell>
  );
}

function TrueFalseBlock({ block, stacked, result, locale, onRespond, onRetry }: BlockCtx) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<boolean | null>(null);
  const cs = contentStrings(locale);
  const answered = Boolean(result);
  const submit = async (answer: boolean) => {
    if (answered || busy) return;
    setPicked(answer);
    setBusy(true);
    await onRespond(block.id, { answer });
    setBusy(false);
  };
  return (
    <InteractiveShell block={block} stacked={stacked}>
      <p className="text-sm font-medium text-slate-900">{courseText(block.props.statement)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            onClick={() => submit(v)}
            disabled={answered || busy}
            className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              answered && picked === v
                ? result?.correct ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-amber-400 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-white text-slate-700 hover:border-seafoam-400"
            }`}
          >
            {v ? cs.true_ : cs.false_}
          </button>
        ))}
      </div>
      {result && <FeedbackPanel result={result} onRetry={() => { setPicked(null); onRetry(block.id); }} t={t} />}
    </InteractiveShell>
  );
}

function QuizBlock({ block, stacked, result, settings, onRespond, onRetry }: BlockCtx) {
  const { t } = useTranslation();
  const questions = Array.isArray(block.props.questions) ? (block.props.questions as Array<Record<string, unknown>>) : [];
  const [selections, setSelections] = useState<number[][]>(() => questions.map(() => []));
  const [busy, setBusy] = useState(false);
  const answered = Boolean(result);
  const perQuestion = (result?.detail?.perQuestion as boolean[] | undefined) ?? [];

  const toggle = (qi: number, oi: number, multi: boolean) => {
    if (answered) return;
    setSelections((prev) =>
      prev.map((sel, i) => {
        if (i !== qi) return sel;
        if (!multi) return [oi];
        return sel.includes(oi) ? sel.filter((v) => v !== oi) : [...sel, oi];
      }),
    );
  };

  const complete = selections.every((s) => s.length > 0);
  return (
    <InteractiveShell block={block} stacked={stacked}>
      <div className="space-y-4">
        {questions.map((q, qi) => {
          const options = Array.isArray(q.options) ? (q.options as Array<Record<string, unknown>>) : [];
          const multi = q.multi === true;
          return (
            <QuizQuestion
              key={qi}
              index={qi}
              question={courseText(q.question)}
              options={options.map((o) => courseText(o.text))}
              multi={multi}
              selected={selections[qi] ?? []}
              verdict={answered ? perQuestion[qi] : undefined}
              shuffle={settings.shuffleAnswers === true}
              onToggle={(oi) => toggle(qi, oi, multi)}
            />
          );
        })}
      </div>
      {!answered && (
        <CheckButton
          disabled={!complete}
          busy={busy}
          t={t}
          onClick={async () => {
            setBusy(true);
            await onRespond(block.id, { answers: selections });
            setBusy(false);
          }}
        />
      )}
      {result && (
        <FeedbackPanel result={result} onRetry={() => { setSelections(questions.map(() => [])); onRetry(block.id); }} t={t} />
      )}
    </InteractiveShell>
  );
}

function QuizQuestion({ index, question, options, multi, selected, verdict, shuffle, onToggle }: {
  index: number; question: string; options: string[]; multi: boolean;
  selected: number[]; verdict?: boolean; shuffle: boolean; onToggle: (oi: number) => void;
}) {
  const order = useDisplayOrder(options.length, shuffle);
  return (
    <div>
      <div className="flex items-start gap-1.5 text-sm font-medium text-slate-900">
        <span>{index + 1}.</span>
        <span>{question}</span>
        {verdict !== undefined && (verdict
          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />)}
      </div>
      <div className="mt-2 space-y-1.5">
        {order.map((oi) => (
          <button
            key={oi}
            onClick={() => onToggle(oi)}
            className={`flex min-h-10 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
              selected.includes(oi) ? "border-seafoam-500 bg-seafoam-50 text-seafoam-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            <span className={`grid h-4 w-4 shrink-0 place-items-center border ${multi ? "rounded" : "rounded-full"} ${selected.includes(oi) ? "border-seafoam-600 bg-seafoam-600" : "border-slate-300"}`}>
              {selected.includes(oi) && <Check className="h-3 w-3 text-white" />}
            </span>
            {options[oi]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ImageChoiceBlock({ block, stacked, result, settings, onRespond, onRetry }: BlockCtx) {
  const { t } = useTranslation();
  const options = Array.isArray(block.props.options) ? (block.props.options as Array<Record<string, unknown>>) : [];
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const order = useDisplayOrder(options.length, settings.shuffleAnswers === true);
  const answered = Boolean(result);
  return (
    <InteractiveShell block={block} stacked={stacked}>
      <p className="text-sm font-medium text-slate-900">{courseText(block.props.question)}</p>
      <div className={`mt-3 grid gap-2 ${options.length > 2 ? "grid-cols-2" : "grid-cols-2"}`}>
        {order.map((oi) => {
          const o = options[oi];
          const isPicked = picked === oi;
          return (
            <button
              key={oi}
              onClick={() => { if (!answered) setPicked(oi); }}
              className={`relative overflow-hidden rounded-xl border-2 transition ${
                isPicked
                  ? answered
                    ? result?.correct ? "border-emerald-500" : "border-amber-500"
                    : "border-seafoam-500"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              {(o.url as string) ? (
                <img src={o.url as string} alt={courseText(o.label) || `Option ${oi + 1}`} className="aspect-video w-full object-cover" />
              ) : (
                <div className="grid aspect-video w-full place-items-center bg-slate-100 text-xs text-slate-400">—</div>
              )}
              {courseText(o.label) && (
                <span className="absolute bottom-1 left-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{courseText(o.label)}</span>
              )}
              {isPicked && (
                <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-seafoam-600 text-white"><Check className="h-4 w-4" /></span>
              )}
            </button>
          );
        })}
      </div>
      {!answered && (
        <CheckButton
          disabled={picked === null}
          busy={busy}
          t={t}
          onClick={async () => {
            if (picked === null) return;
            setBusy(true);
            await onRespond(block.id, { selected: picked });
            setBusy(false);
          }}
        />
      )}
      {result && <FeedbackPanel result={result} onRetry={() => { setPicked(null); onRetry(block.id); }} t={t} />}
    </InteractiveShell>
  );
}

function SortBlock({ block, stacked, result, onRespond, onRetry }: BlockCtx) {
  const { t } = useTranslation();
  const categories = Array.isArray(block.props.categories) ? (block.props.categories as string[]) : [];
  const items = Array.isArray(block.props.items) ? (block.props.items as Array<Record<string, unknown>>) : [];
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const answered = Boolean(result);
  const perItem = (result?.detail?.perItem as Record<string, boolean> | undefined) ?? {};
  const unplaced = items.filter((it) => !placed[it.id as string]);
  const allPlaced = unplaced.length === 0 && items.length > 0;
  const immediate = block.props.immediateFeedback === true;

  const submit = useCallback(async (placements: Record<string, string>) => {
    setBusy(true);
    await onRespond(block.id, { placements: Object.entries(placements).map(([id, category]) => ({ id, category })) });
    setBusy(false);
  }, [block.id, onRespond]);

  const place = (itemId: string, category: string) => {
    if (answered) return;
    const next = { ...placed, [itemId]: category };
    setPlaced(next);
    setSelected(null);
    if (immediate && items.every((it) => next[it.id as string])) void submit(next);
  };

  return (
    <InteractiveShell block={block} stacked={stacked}>
      <p className="text-sm font-medium text-slate-900">{courseText(block.props.prompt)}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{t("cleaner.courses.tapInstruction")}</p>
      {unplaced.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unplaced.map((it) => {
            const id = it.id as string;
            return (
              <button
                key={id}
                onClick={() => setSelected(selected === id ? null : id)}
                className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  selected === id ? "border-seafoam-500 bg-seafoam-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-seafoam-400"
                }`}
              >
                {courseText(it.label)}
              </button>
            );
          })}
        </div>
      )}
      <div className={`mt-3 grid gap-2 ${categories.length > 2 ? "grid-cols-1" : "grid-cols-2"}`}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => { if (selected) place(selected, cat); }}
            disabled={answered || (!selected && !answered)}
            className={`rounded-xl border-2 border-dashed p-2 text-left transition ${
              selected ? "border-seafoam-400 bg-seafoam-50/50" : "border-slate-200"
            } ${answered ? "opacity-90" : ""}`}
          >
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{cat}</div>
            <div className="mt-1 flex min-h-8 flex-wrap gap-1">
              {items.filter((it) => placed[it.id as string] === cat).map((it) => {
                const id = it.id as string;
                const verdict = answered ? perItem[id] : undefined;
                return (
                  <span
                    key={id}
                    onClick={(e) => {
                      if (answered) return;
                      e.stopPropagation();
                      setPlaced((prev) => {
                        const next = { ...prev };
                        delete next[id];
                        return next;
                      });
                    }}
                    className={`inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      verdict === undefined ? "bg-white text-slate-700 ring-1 ring-slate-300"
                        : verdict ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" : "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                    }`}
                  >
                    {courseText(it.label)}
                    {verdict === true && <Check className="h-3 w-3" />}
                    {verdict === false && <XCircle className="h-3 w-3" />}
                  </span>
                );
              })}
            </div>
          </button>
        ))}
      </div>
      {!answered && !immediate && (
        <CheckButton disabled={!allPlaced} busy={busy} t={t} onClick={() => void submit(placed)} />
      )}
      {result && <FeedbackPanel result={result} onRetry={() => { setPlaced({}); onRetry(block.id); }} t={t} />}
    </InteractiveShell>
  );
}

function OrderBlock({ block, stacked, result, onRespond, onRetry }: BlockCtx) {
  const { t } = useTranslation();
  const items = Array.isArray(block.props.items) ? (block.props.items as Array<Record<string, unknown>>) : [];
  const [order, setOrder] = useState<string[]>(() => items.map((it) => it.id as string));
  const [busy, setBusy] = useState(false);
  const answered = Boolean(result);
  const labelOf = (id: string) => courseText(items.find((it) => it.id === id)?.label);

  const move = (i: number, dir: -1 | 1) => {
    if (answered) return;
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  return (
    <InteractiveShell block={block} stacked={stacked}>
      <p className="text-sm font-medium text-slate-900">{courseText(block.props.prompt)}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{t("cleaner.courses.orderInstruction")}</p>
      <ol className="mt-2 space-y-1.5">
        {order.map((id, i) => (
          <li key={id} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
            <span className="flex-1 text-sm text-slate-800">{labelOf(id)}</span>
            <button onClick={() => move(i, -1)} disabled={answered || i === 0} aria-label={t("cleaner.courses.moveUp")}
              className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button onClick={() => move(i, 1)} disabled={answered || i === order.length - 1} aria-label={t("cleaner.courses.moveDown")}
              className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30">
              <ChevronDown className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>
      {!answered && (
        <CheckButton
          disabled={false}
          busy={busy}
          t={t}
          onClick={async () => {
            setBusy(true);
            await onRespond(block.id, { order });
            setBusy(false);
          }}
        />
      )}
      {result && (
        <FeedbackPanel result={result} onRetry={() => { setOrder(items.map((it) => it.id as string)); onRetry(block.id); }} t={t} />
      )}
    </InteractiveShell>
  );
}

function MatchingBlock({ block, stacked, result, onRespond, onRetry }: BlockCtx) {
  const { t } = useTranslation();
  const left = Array.isArray(block.props.left) ? (block.props.left as Array<Record<string, unknown>>) : [];
  const right = Array.isArray(block.props.right) ? (block.props.right as Array<Record<string, unknown>>) : [];
  const [pairs, setPairs] = useState<Record<string, string>>({}); // leftId → rightId
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const answered = Boolean(result);
  const perPair = (result?.detail?.perPair as Record<string, boolean> | undefined) ?? {};
  const pairNumber = (leftId: string) => Object.keys(pairs).sort().indexOf(leftId) + 1;
  const usedRight = new Set(Object.values(pairs));
  const allPaired = left.length > 0 && Object.keys(pairs).length === left.length;

  return (
    <InteractiveShell block={block} stacked={stacked}>
      <p className="text-sm font-medium text-slate-900">{courseText(block.props.prompt)}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{t("cleaner.courses.pairInstruction")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          {left.map((l) => {
            const id = l.id as string;
            const verdict = answered ? perPair[id] : undefined;
            const isPaired = Boolean(pairs[id]);
            return (
              <button
                key={id}
                onClick={() => {
                  if (answered) return;
                  if (isPaired) {
                    setPairs((prev) => {
                      const next = { ...prev };
                      delete next[id];
                      return next;
                    });
                    setSelectedLeft(null);
                  } else {
                    setSelectedLeft(selectedLeft === id ? null : id);
                  }
                }}
                className={`flex min-h-10 w-full items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition ${
                  verdict === true ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : verdict === false ? "border-amber-300 bg-amber-50 text-amber-800"
                    : selectedLeft === id ? "border-seafoam-500 bg-seafoam-50 text-seafoam-900"
                    : isPaired ? "border-slate-300 bg-slate-50 text-slate-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-seafoam-400"
                }`}
              >
                {isPaired && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-seafoam-600 text-[10px] font-bold text-white">{pairNumber(id)}</span>}
                <span className="flex-1">{courseText(l.label)}</span>
                {verdict === true && <Check className="h-3.5 w-3.5" />}
                {verdict === false && <XCircle className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
        <div className="space-y-1.5">
          {right.map((r) => {
            const id = r.id as string;
            const pairedLeft = Object.keys(pairs).find((l) => pairs[l] === id);
            return (
              <button
                key={id}
                onClick={() => {
                  if (answered) return;
                  if (pairedLeft) {
                    setPairs((prev) => {
                      const next = { ...prev };
                      delete next[pairedLeft];
                      return next;
                    });
                    return;
                  }
                  if (selectedLeft) {
                    setPairs((prev) => ({ ...prev, [selectedLeft]: id }));
                    setSelectedLeft(null);
                  }
                }}
                className={`flex min-h-10 w-full items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition ${
                  pairedLeft ? "border-slate-300 bg-slate-50 text-slate-700"
                    : selectedLeft ? "border-seafoam-400 bg-seafoam-50/40 text-slate-700"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {pairedLeft && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-seafoam-600 text-[10px] font-bold text-white">{pairNumber(pairedLeft)}</span>}
                <span className="flex-1">{courseText(r.label)}</span>
              </button>
            );
          })}
        </div>
      </div>
      {!answered && (
        <CheckButton
          disabled={!allPaired}
          busy={busy}
          t={t}
          onClick={async () => {
            setBusy(true);
            await onRespond(block.id, { matches: Object.entries(pairs).map(([l, r]) => ({ left: l, right: r })) });
            setBusy(false);
          }}
        />
      )}
      {result && <FeedbackPanel result={result} onRetry={() => { setPairs({}); onRetry(block.id); }} t={t} />}
    </InteractiveShell>
  );
}

function HotspotBlock({ block, stacked, result, onRespond, onRetry }: BlockCtx) {
  const { t } = useTranslation();
  const p = block.props;
  const targetCount = typeof p.targetCount === "number" ? p.targetCount : 1;
  const [taps, setTaps] = useState<Array<{ x: number; y: number }>>([]);
  const [busy, setBusy] = useState(false);
  const answered = Boolean(result);
  const foundLabels = (result?.detail?.foundLabels as string[] | undefined) ?? [];

  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (answered || !(p.url as string)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    // Tap an existing dot (within ~5%) to remove it; otherwise add.
    const near = taps.findIndex((tp) => Math.hypot(tp.x - x, tp.y - y) < 5);
    if (near >= 0) setTaps((prev) => prev.filter((_, i) => i !== near));
    else if (taps.length < targetCount + 3) setTaps((prev) => [...prev, { x, y }]);
  };

  return (
    <InteractiveShell block={block} stacked={stacked}>
      <p className="text-sm font-medium text-slate-900">{courseText(p.prompt)}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{t("cleaner.courses.hotspotInstruction", { count: targetCount })}</p>
      {(p.url as string) ? (
        <div className="relative mt-2 cursor-crosshair touch-manipulation" onClick={onTap}>
          <img src={p.url as string} alt="" className="w-full rounded-lg" />
          {taps.map((tp, i) => (
            <span
              key={i}
              className={`absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-xs font-bold shadow ${
                answered
                  ? result?.correct ? "border-emerald-500 bg-emerald-100 text-emerald-700" : "border-amber-500 bg-amber-100 text-amber-700"
                  : "border-seafoam-600 bg-white text-seafoam-700"
              }`}
              style={{ left: `${tp.x}%`, top: `${tp.y}%` }}
            >
              {i + 1}
            </span>
          ))}
        </div>
      ) : null}
      {answered && result?.detail && (
        <p className="mt-2 text-xs text-slate-600">
          {t("cleaner.courses.found", { found: result.detail.found, total: result.detail.total })}
          {foundLabels.length > 0 && ` — ${foundLabels.join(", ")}`}
        </p>
      )}
      {!answered && (
        <CheckButton
          disabled={taps.length === 0}
          busy={busy}
          t={t}
          onClick={async () => {
            setBusy(true);
            await onRespond(block.id, { taps });
            setBusy(false);
          }}
        />
      )}
      {result && <FeedbackPanel result={result} onRetry={() => { setTaps([]); onRetry(block.id); }} t={t} />}
    </InteractiveShell>
  );
}

function ScenarioBlock({ block, stacked, result, onRespond, onRetry }: BlockCtx) {
  const { t } = useTranslation();
  const messages = Array.isArray(block.props.messages) ? (block.props.messages as Array<Record<string, unknown>>) : [];
  const choices = Array.isArray(block.props.choices) ? (block.props.choices as Array<Record<string, unknown>>) : [];
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const answered = Boolean(result);
  const choiceFeedback = result?.detail?.choiceFeedback as string | undefined;

  return (
    <InteractiveShell block={block} stacked={stacked}>
      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className="max-w-[92%]">
            {courseText(m.speaker) && (
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{courseText(m.speaker)}</div>
            )}
            <div className="rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800">
              {courseText(m.text)}
              {(m.url as string) && <img src={m.url as string} alt="" className="mt-2 max-h-40 rounded-lg" />}
            </div>
          </div>
        ))}
      </div>
      {courseText(block.props.prompt) && (
        <p className="mt-3 text-sm font-medium text-slate-900">{courseText(block.props.prompt)}</p>
      )}
      <div className="mt-2 space-y-1.5">
        {choices.map((ch, i) => (
          <button
            key={i}
            onClick={async () => {
              if (answered || busy) return;
              setPicked(i);
              setBusy(true);
              await onRespond(block.id, { choice: i });
              setBusy(false);
            }}
            disabled={answered || busy}
            className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition min-h-11 ${
              answered && picked === i
                ? result?.correct ? "border-emerald-400 bg-emerald-50 text-emerald-900" : "border-amber-400 bg-amber-50 text-amber-900"
                : "border-slate-200 bg-white text-slate-700 hover:border-seafoam-400"
            }`}
          >
            {courseText(ch.text)}
          </button>
        ))}
      </div>
      {answered && choiceFeedback && <p className="mt-2 text-xs text-slate-600">{choiceFeedback}</p>}
      {result && <FeedbackPanel result={result} onRetry={() => { setPicked(null); onRetry(block.id); }} t={t} />}
    </InteractiveShell>
  );
}
