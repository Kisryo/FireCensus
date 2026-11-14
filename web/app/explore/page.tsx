"use client";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type Cell, type Compare, type CalendarMonth, type Region, type SeriesRow } from "@/lib/api";
import { CASES, COUNTRIES, countryName } from "@/lib/regions";
import { MONTHS, fmt, VIRIDIS_STOPS, RDBU_STOPS } from "@/lib/colors";
import CalendarHeatmap from "@/components/CalendarHeatmap";
import type { Grid, Preset } from "@/components/Skyline3D";

const Skyline3D = dynamic(() => import("@/components/Skyline3D"), { ssr: false });
const RegionMap = dynamic(() => import("@/components/RegionMap"), { ssr: false });

type Source = "firecensus" | "modis" | "viirs" | "naive";
const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: "firecensus", label: "FireCensus", hint: "Harmonized, VIIRS-equivalent count incl. fires no satellite saw" },
  { id: "modis", label: "Raw MODIS", hint: "Fires seen by Aqua MODIS (1 km pixels): misses most small fires" },
  { id: "viirs", label: "Raw VIIRS", hint: "Fires seen by S-NPP VIIRS (375 m), from 2012 to 2 Nov 2026" },
  { id: "naive", label: "Raw best sensor", hint: "What you get by switching to the newest sensor: a fake 4× jump in 2012" },
];
const PRESETS: { id: Preset; label: string; key: string }[] = [
  { id: "iso", label: "Isometric", key: "1" },
  { id: "front", label: "Front · seasons", key: "2" },
  { id: "side", label: "Side · years", key: "3" },
  { id: "top", label: "Top · 2D", key: "4" },
];

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const k = (s.length - 1) / 2;
  return (s[Math.floor(k)] + s[Math.ceil(k)]) / 2;
};
const quantile = (a: number[], q: number) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const k = (s.length - 1) * q;
  return s[Math.floor(k)] + (s[Math.ceil(k)] - s[Math.floor(k)]) * (k - Math.floor(k));
};

function ExploreInner() {
  const params = useSearchParams();
  const initCase = CASES.find((c) => c.id === params.get("case")) ?? CASES[1];

  const [mode, setMode] = useState<"case" | "country" | "bbox">("case");
  const [caseId, setCaseId] = useState(initCase.id);
  const [country, setCountry] = useState("Indonesia");
  const [bbox, setBbox] = useState(initCase.bbox);
  const [start, setStart] = useState("2002-07");
  const [end, setEnd] = useState("2026-11");
  const [source, setSource] = useState<Source>("firecensus");
  const [view, setView] = useState<"skyline" | "calendar" | "map">("skyline");
  const [preset, setPreset] = useState<Preset>("iso");
  const [anomaly, setAnomaly] = useState(false);
  const [log, setLog] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [fixedScale, setFixedScale] = useState(false);

  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [cal, setCal] = useState<{ critical_months: number[]; months: CalendarMonth[] } | null>(null);
  const [cmp, setCmp] = useState<Compare | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [cellNote, setCellNote] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "slow" | "ready" | "error">("idle");
  const [err, setErr] = useState("");
  const [hover, setHover] = useState<{ y: number; m: number } | null>(null);
  const [picked, setPicked] = useState<{ y: number; m: number }>({ y: initCase.year, m: initCase.month });

  const region: Region = useMemo(
    () => {
      if (mode === "country") return { country };
      if (mode === "case") {
        const c = CASES.find((x) => x.id === caseId)!;
        return c.country ? { country: c.country } : { bbox: c.bbox };
      }
      return { bbox };
    },
    [mode, country, bbox, caseId]
  );
  const regionLabel = mode === "country" ? countryName(country) : mode === "case" ? CASES.find((c) => c.id === caseId)!.title : `Box ${bbox}`;

  const analyze = useCallback(async () => {
    setStatus("loading");
    setErr("");
    const slow = setTimeout(() => setStatus((s) => (s === "loading" ? "slow" : s)), 5000);
    try {
      const [ts, c] = await Promise.all([api.timeseries(region, start, end), api.calendar(region)]);
      setSeries(ts.series);
      setCal(c);
      setStatus(ts.series.some((r) => r.n_hat > 0) ? "ready" : "error");
      if (!ts.series.some((r) => r.n_hat > 0)) setErr("No fires detected in this area and period. Try a larger area.");
    } catch (e: any) {
      setStatus("error");
      setErr(e.message?.includes("fetch") ? "Can't reach the FireCensus API. Is the backend running?" : e.message);
    } finally {
      clearTimeout(slow);
    }
  }, [region, start, end]);

  // re-analyze automatically when a case or country is chosen (box and date edits wait for the Analyze button)
  const regionKey = mode === "bbox" ? "bbox" : JSON.stringify(region);
  useEffect(() => { analyze(); /* eslint-disable-next-line */ }, [regionKey]);

  // month detail: compare + map cells
  useEffect(() => {
    if (status !== "ready") return;
    api.compare(region, picked.y, picked.m).then(setCmp).catch(() => setCmp(null));
    const res = picked.y < 2012 ? 0.5 : 0.25;
    api.cells(picked.y, picked.m, res, region.country ? { country: region.country } : {})
      .then((r) => { setCells(r.cells); setCellNote(r.note); }).catch(() => setCells([]));
  }, [picked, status, region]);

  // keyboard: 1-4 camera presets
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      const p = PRESETS.find((x) => x.key === e.key);
      if (p) { setPreset(p.id); setView("skyline"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const idx = useMemo(() => {
    const m = new Map<string, SeriesRow>();
    series.forEach((r) => m.set(`${r.year}-${r.month}`, r));
    return m;
  }, [series]);

  const pick = (r: SeriesRow | undefined, s: Source) => {
    if (!r) return 0;
    if (s === "modis") return r.aqua_raw ?? 0;
    if (s === "viirs") return r.snpp_raw ?? 0;
    if (s === "naive") return r.naive_best_sensor ?? 0;
    return r.n_hat;
  };

  const grid: Grid | null = useMemo(() => {
    if (!series.length) return null;
    const years = Array.from(new Set(series.map((r) => r.year))).sort();
    const med = new Map<number, number>();
    for (let m = 1; m <= 12; m++) {
      med.set(m, median(series.filter((r) => r.month === m && r.year >= 2003 && r.year <= 2025).map((r) => pick(r, source))));
    }
    return {
      years,
      value: (y, m) => pick(idx.get(`${y}-${m}`), source),
      fc: (y, m) => idx.get(`${y}-${m}`)?.n_hat ?? 0,
      raw: (y, m) => idx.get(`${y}-${m}`)?.aqua_raw ?? 0,
      ratio: (y, m) => (pick(idx.get(`${y}-${m}`), source) + 1) / ((med.get(m) ?? 0) + 1),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, idx, source]);

  // ---------- summary cards ----------
  const summary = useMemo(() => {
    if (!series.length) return null;
    const full = series.filter((r) => r.year >= 2003 && r.year <= 2025);
    const byYear = new Map<number, number>();
    full.forEach((r) => byYear.set(r.year, (byYear.get(r.year) ?? 0) + r.n_hat));
    const topYears = [...byYear.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const p90 = new Map<number, number>();
    for (let m = 1; m <= 12; m++) p90.set(m, quantile(full.filter((r) => r.month === m).map((r) => r.n_hat), 0.9));
    const unusual = series
      .filter((r) => r.n_hat > (p90.get(r.month) ?? Infinity) && r.n_hat > 50)
      .sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month))
      .slice(0, 6);
    return { topYears, unusual };
  }, [series]);

  const critical = useMemo(() => {
    if (!cal) return null;
    const ms = cal.months;
    const peak = ms.reduce((a, b) => (b.n_median > a.n_median ? b : a), ms[0]);
    const crit = cal.critical_months;
    const top3 = [...ms].sort((a, b) => b.n_median - a.n_median).slice(0, 3).map((m) => MONTHS[m.month - 1]);
    return { peak: MONTHS[peak.month - 1], first: MONTHS[(crit[0] ?? peak.month) - 1], last: MONTHS[(crit[crit.length - 1] ?? peak.month) - 1], top3 };
  }, [cal]);

  const hv = hover ? idx.get(`${hover.y}-${hover.m}`) : undefined;

  return (
    <main className="flex h-screen flex-col pt-12">
      <div className="flex min-h-0 flex-1">
        {/* ---------------- control panel ---------------- */}
        <aside className="w-[300px] shrink-0 space-y-5 overflow-y-auto border-r border-line p-4">
          <section>
            <div className="label mb-2">1 · Area</div>
            <div className="mb-2 flex gap-1">
              {(["case", "country", "bbox"] as const).map((m) => (
                <button key={m} className={`btn flex-1 ${mode === m ? "btn-on" : ""}`} onClick={() => setMode(m)}>
                  {m === "case" ? "Case" : m === "country" ? "Country" : "Box"}
                </button>
              ))}
            </div>
            {mode === "case" && (
              <div className="space-y-1">
                {CASES.map((c) => (
                  <button key={c.id} className={`btn w-full text-left ${caseId === c.id ? "btn-on" : ""}`}
                    onClick={() => { setCaseId(c.id); setPicked({ y: c.year, m: c.month }); }}>
                    <div className="text-[13px]">{c.title}</div>
                    <div className="text-[11px] text-slate-500">{c.kicker}</div>
                  </button>
                ))}
              </div>
            )}
            {mode === "country" && (
              <select className="w-full" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {mode === "bbox" && (
              <div className="space-y-1">
                <input className="num w-full" value={bbox} onChange={(e) => setBbox(e.target.value)} aria-label="west,south,east,north" />
                <p className="text-[11px] text-slate-500">west, south, east, north (°). Or use <b>Map → Draw area</b>.</p>
              </div>
            )}
          </section>

          <section>
            <div className="label mb-2">2 · Dates</div>
            <div className="grid grid-cols-[40px_1fr] items-center gap-2 text-sm">
              <span className="text-slate-400">From</span>
              <input type="month" min="2002-07" max="2026-11" value={start} onChange={(e) => setStart(e.target.value)} className="num w-full" />
              <span className="text-slate-400">To</span>
              <input type="month" min="2002-07" max="2026-11" value={end} onChange={(e) => setEnd(e.target.value)} className="num w-full" />
            </div>
            <button className="mt-3 w-full rounded-lg bg-fire px-3 py-2 text-sm font-semibold text-black hover:brightness-110" onClick={analyze}>
              Analyze
            </button>
          </section>

          <section>
            <div className="label mb-2">3 · Data source</div>
            <div className="space-y-1">
              {SOURCES.map((s) => (
                <button key={s.id} title={s.hint} className={`btn w-full text-left ${source === s.id ? "btn-on" : ""}`} onClick={() => setSource(s.id)}>
                  {s.label}
                  <div className="text-[11px] text-slate-500">{s.hint}</div>
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={recovered} onChange={(e) => setRecovered(e.target.checked)} /> Highlight fires recovered vs raw MODIS (orange)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={anomaly} onChange={(e) => setAnomaly(e.target.checked)} /> Anomaly colours (vs median)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} /> Log scale</label>
            <label className="flex items-center gap-2 text-sm" title="Keep bar heights on the FireCensus scale when switching sources, so raw counts look as small as they really are">
              <input type="checkbox" checked={fixedScale || recovered} disabled={recovered} onChange={(e) => setFixedScale(e.target.checked)} /> Same scale for every source
            </label>
          </section>

          <section>
            <div className="label mb-2">4 · Download</div>
            <a className="btn block" href={api.csvTimeseries(region, start, end)}>⬇ Monthly series (CSV)</a>
            <a className="btn mt-1 block" href={api.csvCells(region.country ? { country: region.country } : region, `${picked.y}-${String(picked.m).padStart(2, "0")}`, `${picked.y}-${String(picked.m).padStart(2, "0")}`)}>
              ⬇ 0.1° cells, {MONTHS[picked.m - 1]} {picked.y} (CSV)
            </a>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              Data: NASA FIRMS (MODIS C6.1, VIIRS 375 m). We acknowledge LANCE FIRMS, operated by NASA ESDIS.
            </p>
          </section>
        </aside>

        {/* ---------------- main view ---------------- */}
        <section className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
            <div className="mr-2 text-sm">
              <span className="text-slate-400">Area:</span> <b>{regionLabel}</b>
            </div>
            {(["skyline", "calendar", "map"] as const).map((v) => (
              <button key={v} className={`btn ${view === v ? "btn-on" : ""}`} onClick={() => setView(v)}>
                {v === "skyline" ? "3D skyline" : v === "calendar" ? "2D calendar" : "Map"}
              </button>
            ))}
            {view === "skyline" && (
              <div className="ml-2 flex gap-1">
                {PRESETS.map((p) => (
                  <button key={p.id} className={`btn ${preset === p.id ? "btn-on" : ""}`} onClick={() => setPreset(p.id)} title={`Shortcut: ${p.key}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <Legend anomaly={anomaly} />
          </div>

          <div className="relative min-h-0 flex-1">
            {status === "loading" || status === "slow" ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                {status === "slow" ? "Our server is waking up (about 30 s)…" : "Counting fires…"}
              </div>
            ) : status === "error" ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-300">
                <p>{err}</p>
                <button className="btn" onClick={analyze}>Retry</button>
              </div>
            ) : grid && view === "skyline" ? (
              <Skyline3D grid={grid} preset={preset} log={log} anomaly={anomaly} recovered={recovered && source === "firecensus"} fixedScale={fixedScale || recovered}
                onHover={setHover} onPick={setPicked} />
            ) : grid && view === "calendar" ? (
              <CalendarHeatmap grid={grid} anomaly={anomaly} log={log} selected={picked} onHover={setHover} onPick={setPicked} />
            ) : view === "map" ? (
              <RegionMap cells={cells} res={picked.y < 2012 ? 0.5 : 0.25} anomaly={anomaly} bbox={region.bbox}
                onBbox={(b) => { setBbox(b); setMode("bbox"); }} />
            ) : null}

            {hv && (
              <div className="card pointer-events-none absolute right-4 top-4 w-64 p-3 text-sm">
                <div className="mb-1 font-semibold">{MONTHS[hv.month - 1]} {hv.year}</div>
                <Row k="FireCensus (harmonized)" v={fmt(hv.n_hat)} strong />
                <Row k="Raw MODIS (Aqua)" v={fmt(hv.aqua_raw)} />
                <Row k="Raw VIIRS (S-NPP)" v={hv.year >= 2012 ? fmt(hv.snpp_raw) : "not in orbit"} />
                <Row k="Seen by any sensor" v={fmt(hv.n_obs)} />
                <Row k="Recovered vs MODIS" v={hv.aqua_raw ? `${(hv.n_hat / Math.max(hv.aqua_raw, 1)).toFixed(1)}×` : "–"} />
                <p className="mt-1 text-[11px] text-slate-500">
                  {hv.year < 2012 ? "MODIS-only era: back-cast from Aqua; wider uncertainty." : hv.year === 2026 && hv.month >= 8 ? "Near-real-time data. S-NPP ended 2 Nov 2026." : hv.sensor_era}
                </p>
              </div>
            )}
            {view === "map" && cellNote && (
              <div className="card absolute bottom-4 left-4 max-w-md p-2 text-[11px] text-slate-400">{cellNote}</div>
            )}
          </div>

          {/* ---------------- bottom info bar ---------------- */}
          <div className="grid grid-cols-1 gap-3 border-t border-line p-3 md:grid-cols-4">
            <div className="card p-3">
              <div className="label">This month vs history</div>
              {cmp ? (
                <>
                  <div className="mt-1 text-sm text-slate-300">{MONTHS[cmp.month - 1]} {cmp.year}</div>
                  <div className="num text-2xl font-semibold">{fmt(cmp.n_hat)}</div>
                  <div className="text-xs text-slate-400">
                    median {fmt(cmp.median)} · <b className={cmp.ratio_to_median >= 1.5 ? "text-fire" : cmp.ratio_to_median <= 0.67 ? "text-sat" : ""}>{cmp.ratio_to_median}×</b> · {cmp.percentile}th pct
                  </div>
                  <div className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${cmp.status === "above normal" ? "bg-fire/20 text-fire" : cmp.status === "below normal" ? "bg-sat/20 text-sat" : "bg-white/10"}`}>{cmp.status}</div>
                  <p className="mt-1 text-[11px] text-slate-500">Click any bar or cell to change the month.</p>
                </>
              ) : <div className="text-sm text-slate-500">–</div>}
            </div>
            <div className="card p-3">
              <div className="label">Peak months & years</div>
              {critical && summary ? (
                <div className="mt-1 text-sm">
                  <div>Months: <b>{critical.top3.join(", ")}</b></div>
                  <div className="mt-1">Years: {summary.topYears.map(([y, v], i) => <span key={y} className="num">{i ? " · " : ""}<b>{y}</b> <span className="text-slate-400">{fmt(v)}</span></span>)}</div>
                  <p className="mt-1 text-[11px] text-slate-500">Full years 2003–2025.</p>
                </div>
              ) : "–"}
            </div>
            <div className="card p-3">
              <div className="label">Unusual periods (&gt; 90th pct)</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {summary?.unusual.length ? summary.unusual.map((r) => (
                  <button key={`${r.year}-${r.month}`} className="btn num px-2 py-0.5 text-xs" onClick={() => setPicked({ y: r.year, m: r.month })}>
                    {MONTHS[r.month - 1]} {r.year}
                  </button>
                )) : <span className="text-sm text-slate-500">none</span>}
              </div>
            </div>
            <div className="card p-3">
              <div className="label">Critical period</div>
              {critical ? (
                <div className="mt-1 text-sm">
                  Fire season <b>{critical.first}–{critical.last}</b>, peak in <b>{critical.peak}</b>
                  <p className="mt-1 text-[11px] text-slate-500">Months with a median ≥ 50% of the peak month (2003–2025).</p>
                </div>
              ) : "–"}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-[13px]">
      <span className="text-slate-400">{k}</span>
      <span className={`num ${strong ? "font-semibold text-white" : ""}`}>{v}</span>
    </div>
  );
}

function Legend({ anomaly }: { anomaly: boolean }) {
  const stops = anomaly ? RDBU_STOPS : VIRIDIS_STOPS;
  return (
    <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
      <span>{anomaly ? "¼× median" : "few"}</span>
      <span className="h-2.5 w-28 rounded" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }} />
      <span>{anomaly ? "4× median" : "many fires"}</span>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="pt-20 text-center text-slate-400">Loading…</div>}>
      <ExploreInner />
    </Suspense>
  );
}
