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
 * Observability dashboard visualizations — pure SVG.
 *
 * These were originally react-three-fiber scenes, but five separate WebGL
 * canvases on one page caused constant "WebGLRenderer: Context Lost" +
 * THREE.Clock deprecation spam in the console and burned GPU for what are
 * fundamentally 2D charts. Same exported names/props, zero WebGL.
 */

const STATUS_COLORS = {
  ok: "#10b981",
  warn: "#f59e0b",
  bad: "#ef4444",
} as const;

function latencyColor(ms: number): string {
  return ms < 300 ? STATUS_COLORS.ok : ms < 1000 ? STATUS_COLORS.warn : STATUS_COLORS.bad;
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

// ─── Health Orb ──────────────────────────────────────────────────────────────

export function HealthOrb({ errorRate, label }: { errorRate: number; label: string }) {
  const color = errorRate > 5 ? STATUS_COLORS.bad : errorRate > 1 ? STATUS_COLORS.warn : STATUS_COLORS.ok;
  const statusText = errorRate > 5 ? "Degraded" : errorRate > 1 ? "Warning" : "Healthy";

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`${label}: ${statusText}`}>
        <circle cx="60" cy="60" r="52" fill={color} opacity="0.12">
          <animate attributeName="r" values="50;54;50" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="60" cy="60" r="40" fill={color} opacity="0.25" />
        <circle cx="60" cy="60" r="30" fill={color} />
        <text x="60" y="66" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff">
          {errorRate.toFixed(1)}%
        </text>
      </svg>
      <p className="text-xs font-bold" style={{ color }}>{statusText}</p>
      <p className="text-xs text-slate-600 dark:text-slate-400">{label}</p>
    </div>
  );
}

// ─── Bar Chart ───────────────────────────────────────────────────────────────

export function BarChart3D({
  data,
  title,
}: {
  data: { label: string; value: number; color?: string }[];
  title: string;
}) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const W = 460;
  const H = 190;
  const chartH = 130;
  const baseline = 155;
  const band = W / Math.max(data.length, 1);
  const barW = Math.min(band * 0.55, 56);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }} role="img" aria-label={title}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={baseline - chartH * f} y2={baseline - chartH * f}
            stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="1" strokeDasharray="3 4" />
        ))}
        {data.map((d, i) => {
          const h = Math.max(3, (d.value / maxVal) * chartH);
          const x = i * band + (band - barW) / 2;
          const color = d.color ?? "#14b8a6";
          const display = d.value > 999 ? `${(d.value / 1000).toFixed(1)}k` : String(d.value);
          return (
            <g key={d.label}>
              <rect x={x} y={baseline - h} width={barW} height={h} rx="5" fill={color} opacity="0.9" />
              <text x={x + barW / 2} y={baseline - h - 6} textAnchor="middle" fontSize="12" fill="#64748b">{display}</text>
              <text x={x + barW / 2} y={baseline + 16} textAnchor="middle" fontSize="11" fill="#94a3b8">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Latency Gauges ──────────────────────────────────────────────────────────

function Gauge({ pct, color, label, value }: { pct: number; color: string; label: string; value: string }) {
  const R = 40;
  const C = 2 * Math.PI * R;
  const filled = Math.max(pct, 0.01) * C;
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" role="img" aria-label={`${label}: ${value}`}>
      <circle cx="55" cy="55" r={R} fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="9" />
      <circle
        cx="55" cy="55" r={R} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${filled} ${C - filled}`} transform="rotate(-90 55 55)"
      />
      <text x="55" y="54" textAnchor="middle" fontSize="15" fontWeight="700" fill={color}>{value}</text>
      <text x="55" y="72" textAnchor="middle" fontSize="10" fill="#94a3b8">{label}</text>
    </svg>
  );
}

export function LatencyGauges({ p50, p95, p99, threshold = 2000 }: {
  p50: number; p95: number; p99: number; threshold?: number;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Latency Percentiles</p>
      <div className="flex items-center justify-center gap-6 py-4">
        <Gauge pct={Math.min(p50 / threshold, 1)} color={latencyColor(p50)} label="P50" value={fmtMs(p50)} />
        <Gauge pct={Math.min(p95 / threshold, 1)} color={latencyColor(p95)} label="P95" value={fmtMs(p95)} />
        <Gauge pct={Math.min(p99 / threshold, 1)} color={latencyColor(p99)} label="P99" value={fmtMs(p99)} />
      </div>
    </div>
  );
}

// ─── Booking Funnel ──────────────────────────────────────────────────────────

export function FunnelViz({ steps }: { steps: { label: string; count: number }[] }) {
  const top = steps[0]?.count ?? 1;
  const colors = ["#14b8a6", "#22d3ee", "#38bdf8", "#60a5fa", "#818cf8", "#a78bfa"];
  const W = 480;
  const rowH = 40;
  const H = steps.length * rowH + 8;
  const maxW = 240;
  const minW = 56;
  const cx = 200;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Booking Funnel</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }} role="img" aria-label="Booking funnel">
        {steps.map((step, i) => {
          const pct = top > 0 ? Math.round((step.count / top) * 100) : 0;
          const wTop = minW + ((steps[i - 1] ? (steps[i - 1].count / top) : 1) * (maxW - minW));
          const wBot = minW + (top > 0 ? step.count / top : 0) * (maxW - minW);
          const y = i * rowH + 6;
          const color = colors[i % colors.length] ?? "#14b8a6";
          return (
            <g key={step.label}>
              <path
                d={`M ${cx - wTop / 2} ${y} L ${cx + wTop / 2} ${y} L ${cx + wBot / 2} ${y + rowH - 8} L ${cx - wBot / 2} ${y + rowH - 8} Z`}
                fill={color} opacity="0.85"
              />
              <text x={cx - maxW / 2 - 14} y={y + rowH / 2} textAnchor="end" fontSize="12" fontWeight="600" fill={color}>
                {pct}%
              </text>
              <text x={cx + maxW / 2 + 14} y={y + rowH / 2} textAnchor="start" fontSize="12" fill="#64748b">
                {step.label} ({step.count})
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Payment Flow ────────────────────────────────────────────────────────────

export function PaymentFlowViz({ successRate, total }: { successRate: number; total: number }) {
  const color = successRate >= 95 ? STATUS_COLORS.ok : successRate >= 85 ? STATUS_COLORS.warn : STATUS_COLORS.bad;
  const R = 52;
  const C = 2 * Math.PI * R;
  const filled = Math.max(Math.min(successRate / 100, 1), 0.01) * C;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment Flow</p>
      <div className="flex items-center justify-center py-2">
        <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={`Payment success rate ${successRate.toFixed(1)}%`}>
          <circle cx="75" cy="75" r={R} fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="11" />
          <circle
            cx="75" cy="75" r={R} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
            strokeDasharray={`${filled} ${C - filled}`} transform="rotate(-90 75 75)"
          />
          <text x="75" y="72" textAnchor="middle" fontSize="20" fontWeight="700" fill={color}>
            {successRate.toFixed(1)}%
          </text>
          <text x="75" y="92" textAnchor="middle" fontSize="11" fill="#94a3b8">
            success · {total.toLocaleString()} payments
          </text>
        </svg>
      </div>
    </div>
  );
}
