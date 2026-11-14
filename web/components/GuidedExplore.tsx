"use client";
// Guided Explore panel: pick an area and a month, then read three plain answers.
// Used full-page (fallback) and as the left panel over the Spline globe.
// The 3D skyline / map / calendar views live in chapter 9 of the story page (components/RegionViews.tsx).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type CalendarMonth, type Compare, type Region, type SeriesRow } from "@/lib/api";
import { CASES, COUNTRIES, REGIONS, countryName } from "@/lib/regions";
import { MONTHS, fmt } from "@/lib/colors";
import { HistoryBars, SeasonChart, TrendChart } from "@/components/Charts";

type Tab = "normal" | "season" | "trend";
const TABS: { id: Tab; q: string; short: string; sub: string }[] = [
  { id: "normal", q: "Is this month normal?", short: "Is this month normal?", sub: "Compare with the same month in other years" },
  { id: "season", q: "When is the fire season?", short: "When is fire season?", sub: "The typical year, month by month" },
  { id: "trend", q: "Is the long-term trend real?", short: "Is the trend real?", sub: "Satellite changes vs real change" },
];
const LAST = { y: 2026, m: 11 };

export function useAreaFromUrl() {
  const p = useSearchParams();
  const c = CASES.find((x) => x.id === p.get("case"));
  if (c) return { key: `case:${c.id}`, y: c.year, m: c.month };
  const co = p.get("country");
  if (co && COUNTRIES.some((x) => x.id === co)) return { key: `country:${co}`, y: 2026, m: 10 };
  return { key: `case:${CASES[0].id}`, y: CASES[0].year, m: CASES[0].month };
}

export default function GuidedExplore({ area, onArea, initYear, initMonth, compact, onAreaPicked }: {
  area: string; onArea: (key: string) => void; initYear: number; initMonth: number; compact?: boolean;
  onAreaPicked?: (key: string, y: number, m: number) => void;
}) {
  const setArea = onArea;
  const [year, setYear] = useState(initYear);
  const [month, setMonth] = useState(initMonth);
  useEffect(() => { setYear(initYear); setMonth(initMonth); }, [initYear, initMonth]);
  const [tab, setTab] = useState<Tab>("normal");

  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [cal, setCal] = useState<{ critical_months: number[]; months: CalendarMonth[] } | null>(null);
  const [cmp, setCmp] = useState<Compare | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState("");

  const [kind, id] = area.split(":");
  const theCase = kind === "case" ? CASES.find((c) => c.id === id)! : null;
  const theRegion = kind === "region" ? REGIONS.find((r) => r.id === id)! : null;
  const region: Region = useMemo(
    () => (kind === "country" ? { country: id } : theRegion ? theRegion.region : theCase!.country ? { country: theCase!.country } : { bbox: theCase!.bbox }),
    [kind, id, theCase, theRegion]
  );
  const areaName = kind === "country" ? countryName(id) : theRegion ? theRegion.name : theCase!.title.split(":")[0];

  // load the area's whole record once per area
  useEffect(() => {
    setState("loading");
    Promise.all([api.timeseries(region, "2002-07", `${LAST.y}-${LAST.m}`), api.calendar(region)])
      .then(([ts, c]) => { setSeries(ts.series); setCal(c); setState("ready"); })
      .catch((e) => { setState("error"); setErr(String(e.message).includes("fetch") ? "Can't reach the FireCensus API. Is the backend running?" : e.message); });
  }, [region]);

  useEffect(() => {
    if (state !== "ready") return;
    api.compare(region, year, month).then(setCmp).catch(() => setCmp(null));
  }, [region, year, month, state]);

  const chooseArea = (v: string) => {
    setArea(v);
    const c = v.startsWith("case:") ? CASES.find((x) => `case:${x.id}` === v) : null;
    if (c) { setYear(c.year); setMonth(c.month); }
    onAreaPicked?.(v, c?.year ?? year, c?.month ?? month);
  };

  const row = (y: number, m: number) => series.find((r) => r.year === y && r.month === m);
  const ML = MONTHS[month - 1];

  // ---------- Q1 ----------
  const q1 = useMemo(() => {
    if (!cmp) return null;
    const hist = series.filter((r) => r.month === month && r.year >= 2003).map((r) => ({ year: r.year, n_hat: r.n_hat }));
    const others = hist.filter((h) => h.year !== year && h.year <= 2025);
    const below = others.filter((h) => h.n_hat < cmp.n_hat).length;
    const top = series.filter((r) => r.year >= 2003 && r.year <= 2025);
    const p90 = new Map<number, number>();
    for (let m = 1; m <= 12; m++) {
      const v = top.filter((r) => r.month === m).map((r) => r.n_hat).sort((a, b) => a - b);
      p90.set(m, v.length ? v[Math.floor(0.9 * (v.length - 1))] : Infinity);
    }
    const unusual = series.filter((r) => r.year >= 2003 && r.n_hat > (p90.get(r.month) ?? Infinity) && r.n_hat > 50)
      .sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month)).slice(0, 8);
    return { hist, below, total: others.length, unusual, raw: row(year, month)?.aqua_raw };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmp, series, year, month]);

  // ---------- Q2 ----------
  const q2 = useMemo(() => {
    if (!cal) return null;
    const ms = cal.months;
    const peak = ms.reduce((a, b) => (b.n_median > a.n_median ? b : a), ms[0]);
    const crit = cal.critical_months;
    const cur = Array.from({ length: 12 }, (_, i) => row(year, i + 1)?.n_hat ?? null);
    const curPeak = cur.reduce<{ m: number; v: number }>((a, v, i) => (v !== null && v > a.v ? { m: i + 1, v } : a), { m: 0, v: -1 });
    return { peak: peak.month, first: crit[0] ?? peak.month, last: crit[crit.length - 1] ?? peak.month, cur, curPeak,
      curPeakRatio: curPeak.m ? (curPeak.v + 1) / ((ms[curPeak.m - 1]?.n_median ?? 0) + 1) : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cal, series, year]);

  // ---------- Q3 ----------
  const q3 = useMemo(() => {
    const years = Array.from({ length: 23 }, (_, i) => 2003 + i);
    const sum = (y: number, f: (r: SeriesRow) => number) => series.filter((r) => r.year === y).reduce((a, r) => a + (f(r) || 0), 0);
    const fc = years.map((y) => sum(y, (r) => r.n_hat));
    const naive = years.map((y) => sum(y, (r) => r.naive_best_sensor ?? 0));
    const modis = years.map((y) => sum(y, (r) => r.aqua_raw ?? 0));
    const i12 = years.indexOf(2012);
    const idx = (v: number[]) => {
      const base = v.slice(i12).reduce((a, b) => a + b, 0) / (years.length - i12);
      return v.map((x) => (base ? (100 * x) / base : 0));
    };
    const i11 = years.indexOf(2011);
    const jumpNaive = naive[i11] ? naive[i12] / naive[i11] : null;
    const chgFc = fc[i11] ? (fc[i12] / fc[i11] - 1) * 100 : null;
    const busiest = years.map((y, i) => ({ y, v: fc[i] })).sort((a, b) => b.v - a.v).slice(0, 3);
    return { years, fc: idx(fc), naive: idx(naive), modis: idx(modis), jumpNaive, chgFc, busiest };
  }, [series]);

  const advancedHref = kind === "country" ? `/?country=${id}#explore` : kind === "case" ? `/?case=${id}#explore` : `/#explore`;
  const statusColor = cmp?.status === "above normal" ? "bg-fire/20 text-fire" : cmp?.status === "below normal" ? "bg-sat/20 text-sat" : "bg-white/10 text-slate-200";

  return (
    <div className={compact ? "px-5 pb-10 pt-4" : "mx-auto max-w-6xl px-5 pb-16 pt-20"}>
      {/* ---------- 1. area + month ---------- */}
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <label className="flex flex-col gap-1">
          <span className="label">Area</span>
          <select value={area} onChange={(e) => chooseArea(e.target.value)} className="min-w-[260px] py-1.5 text-[15px]">
            <optgroup label="Featured cases">
              {CASES.map((c) => <option key={c.id} value={`case:${c.id}`}>{c.title}</option>)}
            </optgroup>
            {kind === "region" && <option value={area}>{areaName}</option>}
            <optgroup label="Countries">
              {COUNTRIES.map((c) => <option key={c.id} value={`country:${c.id}`}>{c.name}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Month</span>
          <div className="flex gap-2">
            <select value={month} onChange={(e) => setMonth(+e.target.value)} className="py-1.5 text-[15px]">
              {MONTHS.map((m, i) => <option key={m} value={i + 1} disabled={year === LAST.y && i + 1 > LAST.m}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => { const y = +e.target.value; setYear(y); if (y === LAST.y && month > LAST.m) setMonth(LAST.m); }} className="num py-1.5 text-[15px]">
              {Array.from({ length: LAST.y - 2002 }, (_, i) => LAST.y - i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <a className="btn" href={api.csvTimeseries(region, "2002-07", `${LAST.y}-${LAST.m}`)}>⬇ Monthly data (CSV)</a>
          <Link className="btn" href={advancedHref}>3D globe, skyline & map →</Link>
        </div>
        {theCase && <p className="w-full text-sm text-slate-400">{theCase.story[0]}</p>}
      </div>

      {/* ---------- 2. question tabs ---------- */}
      <div className={`mt-4 grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-1 md:grid-cols-3"}`} role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`rounded-xl border ${compact ? "px-3 py-2" : "p-4"} text-left transition ${tab === t.id ? "border-fire bg-fire/10" : "border-line bg-panel/60 hover:border-slate-500"}`}>
            <div className={compact ? "text-[13px] font-semibold leading-snug" : "text-[17px] font-semibold"}>{compact ? t.short : t.q}</div>
            {!compact && <div className="text-sm text-slate-400">{t.sub}</div>}
          </button>
        ))}
      </div>

      {/* ---------- 3. answer ---------- */}
      <section className={`card mt-4 ${compact ? "p-4" : "p-6"}`}>
        {state === "loading" && <p className="text-slate-400">Counting fires…</p>}
        {state === "error" && <p className="text-slate-300">{err}</p>}

        {state === "ready" && tab === "normal" && cmp && q1 && (
          <>
            <p className="text-slate-400">{areaName} · {ML} {year}</p>
            <h2 className={`mt-1 ${compact ? "text-2xl" : "text-3xl"} font-semibold leading-tight`}>
              <span className="num">{fmt(cmp.n_hat)}</span> fires, <span className={cmp.ratio_to_median >= 1.5 ? "text-fire" : cmp.ratio_to_median <= 0.67 ? "text-sat" : ""}>{cmp.ratio_to_median}×</span> a typical {ML}
              <span className={`ml-3 inline-block rounded-md px-2 py-1 align-middle text-sm ${statusColor}`}>{cmp.status}</span>
            </h2>
            <p className="mt-2 max-w-3xl text-slate-300">
              More fires than in <b>{q1.below} of the {q1.total}</b> other {ML}s since 2003. A typical {ML} here has about {fmt(cmp.median)} fires.
              {q1.raw ? <> A single satellite (MODIS) saw only <b>{fmt(q1.raw)}</b> of them. The rest were missed or too small for its 1 km pixels.</> : null}
            </p>
            <div className="mt-5"><HistoryBars history={q1.hist} year={year} median={cmp.median} monthLabel={ML} onPick={setYear} /></div>
            <p className="mt-1 text-xs text-slate-500">Click a bar to jump to that year.</p>
            {q1.unusual.length > 0 && (
              <div className="mt-5">
                <div className="label">Months far above normal (top 10% for their calendar month)</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q1.unusual.map((r) => (
                    <button key={`${r.year}-${r.month}`} className="btn num px-2 py-0.5 text-xs" onClick={() => { setYear(r.year); setMonth(r.month); }}>
                      {MONTHS[r.month - 1]} {r.year}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {state === "ready" && tab === "season" && q2 && cal && (
          <>
            <p className="text-slate-400">{areaName}</p>
            <h2 className={`mt-1 ${compact ? "text-2xl" : "text-3xl"} font-semibold leading-tight`}>
              Fire season runs <span className="text-fire">{MONTHS[q2.first - 1]}–{MONTHS[q2.last - 1]}</span>, peaking in {MONTHS[q2.peak - 1]}
            </h2>
            <p className="mt-2 max-w-3xl text-slate-300">
              Based on 2003–2025. The shaded months are the critical period, when a typical month has at least half the fires of the peak month.
              {q2.curPeak.m > 0 && q2.curPeakRatio && (
                <> In <b>{year}</b>, the busiest month was <b>{MONTHS[q2.curPeak.m - 1]}</b> with {fmt(q2.curPeak.v)} fires, {q2.curPeakRatio.toFixed(1)}× its typical level.</>
              )}
            </p>
            <div className="mt-5"><SeasonChart months={cal.months} current={q2.cur} year={year} critical={cal.critical_months} /></div>
            <p className="mt-1 text-xs text-slate-500">Change the year at the top to compare another season against the typical one.</p>
          </>
        )}

        {state === "ready" && tab === "trend" && (
          <>
            <p className="text-slate-400">{areaName} · yearly totals 2003–2025</p>
            <h2 className={`mt-1 ${compact ? "text-2xl" : "text-3xl"} font-semibold leading-tight`}>
              {q3.jumpNaive && q3.jumpNaive > 1.5 ? <>The 2012 jump is the satellite, not the fires</> : <>Yearly fire activity, free of sensor changes</>}
            </h2>
            <p className="mt-2 max-w-3xl text-slate-300">
              {q3.jumpNaive ? <>If you always use the newest satellite, fire counts jump <b className="text-fire">×{q3.jumpNaive.toFixed(1)}</b> from 2011 to 2012, the year VIIRS arrived. </> : null}
              {q3.chgFc !== null ? <>FireCensus changes by <b className="text-sat">{q3.chgFc > 0 ? "+" : ""}{q3.chgFc.toFixed(0)}%</b>, because it counts the fires each sensor misses. </> : null}
              Busiest years: {q3.busiest.map((b, i) => <span key={b.y}>{i ? ", " : ""}<b>{b.y}</b></span>)}.
            </p>
            <div className="mt-5">
              <TrendChart years={q3.years} series={[
                { label: "FireCensus (harmonized)", color: "#4FC3F7", values: q3.fc },
                { label: "Newest satellite available (raw)", color: "#FF6B35", values: q3.naive, dashed: true },
                { label: "MODIS only (raw)", color: "#94a3b8", values: q3.modis, dashed: true },
              ]} />
            </div>
            <p className="mt-1 text-xs text-slate-500">Each line is scaled so its 2012–2025 average = 100, so sources with very different raw counts can share one axis.</p>
          </>
        )}
      </section>

      <p className="mt-4 text-xs text-slate-500">
        Fire counts are FireCensus harmonized estimates (VIIRS-equivalent, including fires no satellite saw), afternoon window, 0.1° grid.
        2002–2011 reconstructed from MODIS; Aug–Nov 2026 near-real-time. Data: NASA FIRMS (LANCE / ESDIS). <Link href="/method" className="text-sat underline">How it works</Link>
      </p>
    </div>
  );
}
