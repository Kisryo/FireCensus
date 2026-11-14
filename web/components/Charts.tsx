"use client";
// Plain 2D charts for the guided Explore page. Each one answers a single question.
import { MONTHS, fmt } from "@/lib/colors";

const AX = "#64748b";
const GRID = "#1F2A44";

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Q1: the same calendar month in every year; the chosen year highlighted; median line. */
export function HistoryBars({ history, year, median, monthLabel, onPick }: {
  history: { year: number; n_hat: number }[]; year: number; median: number; monthLabel: string; onPick?: (y: number) => void;
}) {
  const W = 760, H = 300, L = 56, R = 12, T = 16, B = 34;
  const max = niceMax(Math.max(median, ...history.map((h) => h.n_hat)));
  const bw = (W - L - R) / Math.max(history.length, 1);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Fires in ${monthLabel} of each year, with the median`}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke={GRID} />
          <text x={L - 6} y={y(max * f) + 4} textAnchor="end" fontSize={11} fill={AX}>{fmt(max * f)}</text>
        </g>
      ))}
      {history.map((h, i) => {
        const sel = h.year === year;
        return (
          <g key={h.year} className={onPick ? "cursor-pointer" : ""} onClick={() => onPick?.(h.year)}>
            <rect x={L + i * bw + 2} y={y(h.n_hat)} width={bw - 4} height={Math.max(0, H - B - y(h.n_hat))}
              rx={2} fill={sel ? "#FF6B35" : h.year < 2012 ? "#3b4a6b" : "#4b6a9b"}>
              <title>{`${monthLabel} ${h.year}: ${fmt(h.n_hat)} fires`}</title>
            </rect>
            {(sel || h.year % 4 === 2) && (
              <text x={L + i * bw + bw / 2} y={H - B + 14} textAnchor="middle" fontSize={10} fill={sel ? "#FF6B35" : AX}>{h.year}</text>
            )}
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={y(median)} y2={y(median)} stroke="#e2e8f0" strokeDasharray="5 4" />
      <text x={W - R} y={y(median) - 6} textAnchor="end" fontSize={11} fill="#e2e8f0">typical {monthLabel} (median {fmt(median)})</text>
      <text x={L} y={H - 4} fontSize={10} fill={AX}>Darker bars: 2002–2011, reconstructed from MODIS alone</text>
    </svg>
  );
}

/** Q2: seasonal curve — typical month (median) with the usual range, plus one chosen year. */
export function SeasonChart({ months, current, year, critical }: {
  months: { month: number; n_median: number; n_p25: number; n_p75: number }[];
  current: (number | null)[]; year: number; critical: number[];
}) {
  const W = 760, H = 300, L = 56, R = 12, T = 16, B = 30;
  const max = niceMax(Math.max(...months.map((m) => m.n_p75), ...current.map((c) => c ?? 0)));
  const x = (m: number) => L + ((m - 1) / 11) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const band = months.map((m) => `${x(m.month)},${y(m.n_p75)}`).join(" ") + " " + [...months].reverse().map((m) => `${x(m.month)},${y(m.n_p25)}`).join(" ");
  const med = months.map((m, i) => `${i ? "L" : "M"}${x(m.month)},${y(m.n_median)}`).join("");
  const cur = current.map((v, i) => (v === null ? "" : `${current.slice(0, i).some((c) => c !== null) ? "L" : "M"}${x(i + 1)},${y(v)}`)).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Typical fire season by month">
      {critical.length > 0 && (
        <rect x={x(Math.min(...critical)) - 18} y={T} width={x(Math.max(...critical)) - x(Math.min(...critical)) + 36} height={H - T - B} fill="#FF6B35" opacity={0.08} />
      )}
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke={GRID} />
          <text x={L - 6} y={y(max * f) + 4} textAnchor="end" fontSize={11} fill={AX}>{fmt(max * f)}</text>
        </g>
      ))}
      {MONTHS.map((m, i) => <text key={m} x={x(i + 1)} y={H - B + 16} textAnchor="middle" fontSize={11} fill={critical.includes(i + 1) ? "#FF6B35" : AX}>{m}</text>)}
      <polygon points={band} fill="#4FC3F7" opacity={0.15} />
      <path d={med} fill="none" stroke="#4FC3F7" strokeWidth={2.5} />
      <path d={cur} fill="none" stroke="#FF6B35" strokeWidth={2.5} />
      <g fontSize={11}>
        <rect x={L + 8} y={T + 4} width={12} height={3} fill="#4FC3F7" /><text x={L + 26} y={T + 9} fill="#cbd5e1">typical year (median, shaded = usual range)</text>
        <rect x={L + 8} y={T + 20} width={12} height={3} fill="#FF6B35" /><text x={L + 26} y={T + 25} fill="#cbd5e1">{year}</text>
      </g>
    </svg>
  );
}

/** Q3: yearly totals as an index (2012–2025 average = 100) so different sources share one axis. */
export function TrendChart({ years, series }: {
  years: number[]; series: { label: string; color: string; values: number[]; dashed?: boolean }[];
}) {
  const W = 760, H = 300, L = 44, R = 12, T = 16, B = 30;
  const max = niceMax(Math.max(150, ...series.flatMap((s) => s.values)));
  const x = (i: number) => L + (i / Math.max(years.length - 1, 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const i2012 = years.indexOf(2012);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Yearly fire totals by data source">
      {[0, 100, max].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 100 ? "#334155" : GRID} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={AX}>{v}</text>
        </g>
      ))}
      {i2012 >= 0 && (
        <g>
          <line x1={x(i2012) - (x(1) - x(0)) / 2} x2={x(i2012) - (x(1) - x(0)) / 2} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="3 4" />
          <text x={x(i2012) - (x(1) - x(0)) / 2 + 6} y={T + 12} fontSize={11} fill="#94a3b8">VIIRS starts (2012)</text>
        </g>
      )}
      {years.map((yr, i) => (yr % 3 === 0 ? <text key={yr} x={x(i)} y={H - B + 16} textAnchor="middle" fontSize={11} fill={AX}>{yr}</text> : null))}
      {series.map((s) => (
        <path key={s.label} d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("")} fill="none" stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dashed ? "6 5" : undefined} />
      ))}
      <g fontSize={11}>
        {series.map((s, k) => (
          <g key={s.label}>
            <rect x={L + 8} y={T + 4 + k * 16} width={12} height={3} fill={s.color} />
            <text x={L + 26} y={T + 9 + k * 16} fill="#cbd5e1">{s.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
