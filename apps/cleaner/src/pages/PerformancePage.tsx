import { Star, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardShell, Card } from "@sweepr/ui";

const perf = {
  rating: 4.8,
  reviewCount: 142,
  tier: "preferred" as "standard" | "preferred" | "elite",
  acceptanceRate: 94,
  completionRate: 99,
  responseTime: "2m 14s",
  jobs: 142,
};

const tierThresholds = {
  preferred: { rating: 4.7, acceptance: 85, jobs: 20 },
  elite: { rating: 4.9, acceptance: 95, jobs: 100 },
};

const topReviews = [
  {
    name: "Jane",
    comment: "Spotless work and super friendly. Booking again!",
  },
  { name: "Marcus", comment: "On time, thorough, great communication." },
  { name: "Priya", comment: "Left my kitchen sparkling. Highly recommend." },
];

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span
      className="inline-flex"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          width={size}
          height={size}
          className={
            i <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-slate-300 dark:text-slate-600"
          }
        />
      ))}
    </span>
  );
}

function CircularProgress({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          strokeWidth="8"
          className="stroke-slate-100 dark:stroke-slate-800"
        />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          strokeWidth="8"
          stroke="#2DD4BF"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 48 48)"
        />
        <text
          x="48"
          y="53"
          textAnchor="middle"
          className="fill-charcoal text-lg font-bold dark:fill-white"
        >
          {value}%
        </text>
      </svg>
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

export function PerformancePage() {
  const { t } = useTranslation();
  const isElite = perf.tier === "elite";
  const next = perf.tier === "standard" ? tierThresholds.preferred : tierThresholds.elite;

  return (
    <DashboardShell
      title={t("cleaner.performance.title")}
      description={t("cleaner.performance.description")}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center text-center">
          <p className="text-5xl font-bold text-charcoal dark:text-white">
            {perf.rating.toFixed(1)}
          </p>
          <div className="mt-2">
            <Stars rating={perf.rating} size={20} />
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {perf.reviewCount} reviews
          </p>
        </Card>

        <Card className="flex flex-col items-center justify-center text-center">
          <span className="rounded-full bg-seafoam-100 px-4 py-1.5 text-sm font-semibold capitalize text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300">
            {perf.tier} tier
          </span>
          {!isElite && (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Reach {next.rating}+ rating, {next.acceptance}%+ acceptance, and{" "}
              {next.jobs}+ jobs for the next tier.
            </p>
          )}
        </Card>

        <Card className="flex flex-col items-center justify-center text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Avg. response time
          </p>
          <p className="mt-2 text-3xl font-bold text-charcoal dark:text-white">
            {perf.responseTime}
          </p>
        </Card>
      </div>

      <Card>
        <div className="grid gap-6 sm:grid-cols-2">
          <CircularProgress value={perf.acceptanceRate} label="Acceptance rate" />
          <CircularProgress value={perf.completionRate} label="Completion rate" />
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-charcoal dark:text-white">
          Top reviews
        </h2>
        <div className="space-y-3">
          {topReviews.map((r) => (
            <div
              key={r.name}
              className="rounded-xl border border-slate-100 p-4 dark:border-slate-800"
            >
              <div className="mb-1 flex items-center gap-2">
                <Stars rating={5} />
                <span className="text-sm font-medium text-charcoal dark:text-white">
                  {r.name}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                "{r.comment}"
              </p>
            </div>
          ))}
        </div>
      </Card>

      {!isElite && (
        <Card className="bg-gradient-to-r from-seafoam-50 to-transparent dark:from-seafoam-900/20">
          <div className="flex items-start gap-3">
            <TrendingUp className="mt-0.5 h-5 w-5 text-seafoam-600 dark:text-seafoam-400" />
            <div>
              <h2 className="font-semibold text-charcoal dark:text-white">
                Tips to reach the next tier
              </h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-500 dark:text-slate-400">
                <li>Accept more job offers to lift your acceptance rate</li>
                <li>Respond to offers quickly — speed boosts your ranking</li>
                <li>Keep earning 5-star reviews by going the extra mile</li>
              </ul>
            </div>
          </div>
        </Card>
      )}
    </DashboardShell>
  );
}
