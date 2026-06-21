import { Briefcase, DollarSign, Sparkles, FileText } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { DashboardShell, StatCard, Card, StatusBadge } from "@sweepr/ui";
import { formatCurrency, SERVICE_LABELS } from "@sweepr/utils";
import { adminJobs, adminApplications, adminCleaners } from "../data/mock";

const SEAFOAM = ["#2DD4BF", "#14B8A6", "#0D9488", "#0F766E"];

// Mock series data.
const revenueSeries = Array.from({ length: 30 }, (_, i) => ({
  day: `${i + 1}`,
  revenue: Math.round(800 + Math.sin(i / 3) * 300 + i * 12 + Math.random() * 150),
}));

const jobStatusData = [
  { name: "Booked", value: 18 },
  { name: "In progress", value: 7 },
  { name: "Completed", value: 42 },
  { name: "Cancelled", value: 5 },
];

const newCustomersData = [
  { week: "W1", customers: 24 },
  { week: "W2", customers: 31 },
  { week: "W3", customers: 28 },
  { week: "W4", customers: 39 },
];

const utilizationData = adminCleaners.slice(0, 6).map((c, i) => ({
  name: c.name,
  jobs: 3 + ((i * 2) % 6),
  capacity: 10,
}));

const POSTHOG_DASHBOARD_URL = import.meta.env.VITE_POSTHOG_DASHBOARD_URL as
  | string
  | undefined;

function AnalyticsSection() {
  return (
    <Card>
      <h2 className="mb-4 font-semibold text-charcoal dark:text-white">
        Analytics
      </h2>
      {POSTHOG_DASHBOARD_URL ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <iframe
            title="PostHog dashboard"
            src={POSTHOG_DASHBOARD_URL}
            className="h-[480px] w-full"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
          <p className="font-medium text-charcoal dark:text-white">
            Configure PostHog
          </p>
          <p className="mt-1">
            Set <code>VITE_POSTHOG_DASHBOARD_URL</code> to a shared PostHog
            dashboard URL to embed it here. See the{" "}
            <a className="text-seafoam-600 underline" href="/events">
              Events page
            </a>{" "}
            for the live server-side audit feed.
          </p>
        </div>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const revenue = adminJobs.reduce((s, j) => s + j.quote.total, 0);
  return (
    <DashboardShell
      title="Dashboard"
      description="Platform health at a glance."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Jobs today" value={String(adminJobs.length)} icon={Briefcase} />
        <StatCard
          label="Revenue today"
          value={formatCurrency(revenue)}
          icon={DollarSign}
          delta="+8.2%"
          deltaPositive
        />
        <StatCard
          label="Active cleaners"
          value={String(adminCleaners.filter((c) => c.status === "approved").length)}
          icon={Sparkles}
        />
        <StatCard
          label="Pending applications"
          value={String(adminApplications.length)}
          icon={FileText}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold text-charcoal dark:text-white">
            Revenue — last 30 days
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={SEAFOAM[0]}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-charcoal dark:text-white">
            Jobs by status
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={jobStatusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {jobStatusData.map((_, i) => (
                    <Cell key={i} fill={SEAFOAM[i % SEAFOAM.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-charcoal dark:text-white">
            New customers — last 4 weeks
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={newCustomersData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="customers" fill={SEAFOAM[1]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-charcoal dark:text-white">
            Cleaner utilization (this week)
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={utilizationData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="jobs" fill={SEAFOAM[2]} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="flex items-center justify-between bg-gradient-to-r from-seafoam-50 to-transparent dark:from-seafoam-900/20">
        <div>
          <h2 className="font-semibold text-charcoal dark:text-white">
            Geographic heatmap
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Coming soon — Mapbox heatmap of booking density.
          </p>
        </div>
        <span className="rounded-full bg-seafoam-100 px-3 py-1 text-xs font-medium text-seafoam-700 dark:bg-seafoam-900/40 dark:text-seafoam-300">
          Beta
        </span>
      </Card>

      <AnalyticsSection />

      <Card>
        <h2 className="mb-4 font-semibold text-charcoal dark:text-white">
          Recent jobs
        </h2>
        <div className="space-y-2">
          {adminJobs.slice(0, 5).map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800"
            >
              <div>
                <p className="text-sm font-medium text-charcoal dark:text-white">
                  {j.id}
                </p>
                <p className="text-xs text-slate-500">
                  {SERVICE_LABELS[j.serviceType]} · {j.address.city}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <StatusBadge status={j.status} />
                <span className="text-sm font-semibold text-charcoal dark:text-white">
                  {formatCurrency(j.quote.total)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </DashboardShell>
  );
}
