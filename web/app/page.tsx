"use client";
// One continuous story on one globe (page-flow.md section 2, extended):
//   chapters 1-5 explain the problem and the method (Spline Welcome / Story_* states),
//   chapters 6-8 walk through a real example with live data (Story_Example_* states, Spline v5),
//   chapter 9 hands the globe to the visitor: click a pin, the Spline globe zooms to the region,
//   then a real map of that region fades in and flies down onto it (components/RegionExplorer.tsx).
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type CalendarMonth, type Compare, type SeriesRow } from "@/lib/api";
import { CASES, REGIONS, labelForArea, pinForArea } from "@/lib/regions";
import { MONTHS, fmt } from "@/lib/colors";
import { HistoryBars, SeasonChart, TrendChart } from "@/components/Charts";
const RegionExplorer = dynamic(() => import("@/components/RegionExplorer"), { ssr: false });
import ErrorBoundary from "@/components/ErrorBoundary";

const SplineScene = dynamic(() => import("@/components/SplineScene"), { ssr: false });
const LATEST = { y: 2026, m: 10 };

type Chapter = { scene: string; kicker: string; title: string; body: string; chart?: "q1" | "q2" | "q3"; explore?: boolean };
const CHAPTERS: Chapter[] = [
  { scene: "Welcome", kicker: "1 · The problem", title: "Every dry season, smoke covers Southeast Asia.",
    body: "Satellites have watched these fires for 25 years. But the satellites changed, so the record can't be compared from one year to the next." },
  { scene: "Story_Fleet", kicker: "2 · Two kinds of eyes", title: "Five satellites, two generations.",
    body: "MODIS on Terra and Aqua (2000–) sees 1 km pixels. VIIRS on S-NPP, NOAA-20 and NOAA-21 (2012–) sees 375 m pixels and finds far more small fires. Switch from one to the other and fire counts jump about 4×, even though the fires didn't change." },
  { scene: "Story_Scan", kicker: "3 · Nobody sees everything", title: "Each satellite misses fires the others see.",
    body: "Over Borneo, big fires are seen by every pass. Small peat fires are seen by one, or by none. In the afternoon window we use three of them: Aqua, S-NPP and NOAA-20." },
  { scene: "Story_Zoom", kicker: "4 · The idea", title: "We count fires the way ecologists count animals.",
    body: "Each fire gets a capture history: (1,0,1) means Aqua and NOAA-20 saw it but S-NPP didn't. From thousands of these histories, capture-recapture statistics estimate how many fires no satellite saw, the (0,0,0) fires." },
  { scene: "Story_Handoff", kicker: "5 · The result", title: "One fire record, 2002–2026, where the sensor doesn't matter.",
    body: "Remove a satellite and raw counts move by 15–25%. FireCensus moves by 0–6%. When S-NPP went silent on 2 November 2026, nothing broke. Let's use it on a fire season that is happening right now." },
  { scene: "Story_Example_Month", kicker: "6 · Is this month normal?", title: "", body: "", chart: "q1" },
  { scene: "Story_Example_Season", kicker: "7 · When is the fire season?", title: "", body: "", chart: "q2" },
  { scene: "Story_Example_Trend", kicker: "8 · Is the long-term trend real?", title: "", body: "", chart: "q3" },
  { scene: "Explore_Overview", kicker: "9 · Your turn", title: "", body: "", explore: true },
];
const EXPLORE = CHAPTERS.length - 1;

// ---------- live example: Indonesia ----------
function useIndonesia() {
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [cal, setCal] = useState<{ critical_months: number[]; months: CalendarMonth[] } | null>(null);
  const [cmp, setCmp] = useState<Compare | null>(null);
  useEffect(() => {
    const r = { country: "Indonesia" };
    api.timeseries(r, "2002-07", "2026-11").then((t) => setSeries(t.series)).catch(() => {});
    api.calendar(r).then(setCal).catch(() => {});
    api.compare(r, 2026, 8).then(setCmp).catch(() => {});
  }, []);
  return useMemo(() => {
    if (!series.length || !cal || !cmp) return null;
    const hist = series.filter((r) => r.month === 8 && r.year >= 2003).map((r) => ({ year: r.year, n_hat: r.n_hat }));
    const below = hist.filter((h) => h.year <= 2025 && h.n_hat < cmp.n_hat).length;
    const raw = series.find((r) => r.year === 2026 && r.month === 8)?.aqua_raw ?? 0;
    const cur = Array.from({ length: 12 }, (_, i) => series.find((r) => r.year === 2026 && r.month === i + 1)?.n_hat ?? null);
    const years = Array.from({ length: 23 }, (_, i) => 2003 + i);
    const sum = (y: number, f: (r: SeriesRow) => number) => series.filter((r) => r.year === y).reduce((a, r) => a + (f(r) || 0), 0);
    const fc = years.map((y) => sum(y, (r) => r.n_hat)), naive = years.map((y) => sum(y, (r) => r.naive_best_sensor ?? 0)), modis = years.map((y) => sum(y, (r) => r.aqua_raw ?? 0));
    const i12 = years.indexOf(2012), i11 = i12 - 1;
    const idx = (v: number[]) => { const b = v.slice(i12).reduce((a, x) => a + x, 0) / (years.length - i12); return v.map((x) => (100 * x) / (b || 1)); };
    const ms = cal.months; const peak = ms.reduce((a, b) => (b.n_median > a.n_median ? b : a), ms[0]); const cr = cal.critical_months;
    return { cmp, hist, below, raw, cal, cur, peak: peak.month, first: cr[0], last: cr[cr.length - 1],
      years, fc: idx(fc), naive: idx(naive), modis: idx(modis), jump: naive[i12] / (naive[i11] || 1), chg: (fc[i12] / (fc[i11] || 1) - 1) * 100 };
  }, [series, cal, cmp]);
}

function ExampleCard({ chart, d }: { chart: "q1" | "q2" | "q3"; d: ReturnType<typeof useIndonesia> }) {
  if (!d) return <p className="mt-3 text-slate-400">Loading Indonesia&apos;s fire record… (needs the API running)</p>;
  if (chart === "q1") return (
    <>
      <h2 className="mt-2 text-2xl font-semibold leading-snug">
        August 2026 in Indonesia: <span className="num">{fmt(d.cmp.n_hat)}</span> fires, <span className="text-fire">{d.cmp.ratio_to_median}×</span> a typical August.
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-300">
        More than in {d.below} of the 23 Augusts since 2003, and the highest August since VIIRS began in 2012. A single satellite (MODIS) saw only {fmt(d.raw)} of them.
        Raw pixel counts make this season look up to 16× normal. Harmonized, it is about 2×.
      </p>
      <div className="mt-3"><HistoryBars history={d.hist} year={2026} median={d.cmp.median} monthLabel="Aug" /></div>
    </>
  );
  if (chart === "q2") return (
    <>
      <h2 className="mt-2 text-2xl font-semibold leading-snug">
        Indonesia burns from <span className="text-fire">{MONTHS[d.first - 1]} to {MONTHS[d.last - 1]}</span>, peaking in {MONTHS[d.peak - 1]}.
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-300">
        The blue line is a typical year (2003–2025); the shaded band is the usual range. The orange line is 2026: an early, strong start in August, and October well above normal.
      </p>
      <div className="mt-3"><SeasonChart months={d.cal.months} current={d.cur} year={2026} critical={d.cal.critical_months} /></div>
    </>
  );
  return (
    <>
      <h2 className="mt-2 text-2xl font-semibold leading-snug">The 2012 jump is the satellite, not the fires.</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-300">
        If you always use the newest satellite, Indonesia&apos;s fire count jumps <b className="text-fire">×{d.jump.toFixed(1)}</b> when VIIRS arrives in 2012.
        FireCensus changes by <b className="text-sat">{d.chg > 0 ? "+" : ""}{d.chg.toFixed(0)}%</b>. The real story is in the peaks: 2006, 2015, 2019 and 2023 were El Niño or drought years.
      </p>
      <div className="mt-3"><TrendChart years={d.years} series={[
        { label: "FireCensus (harmonized)", color: "#4FC3F7", values: d.fc },
        { label: "Newest satellite (raw)", color: "#FF6B35", values: d.naive, dashed: true },
        { label: "MODIS only (raw)", color: "#94a3b8", values: d.modis, dashed: true },
      ]} /></div>
    </>
  );
}

function RegionPicker({ pick, pickCase }: { pick: (id: string) => void; pickCase: (id: string) => void }) {
  return (
    <>
      <h2 className="mt-2 text-2xl font-semibold leading-snug">Now pick any region.</h2>
      <p className="mt-2 text-[15px] text-slate-300"><b>Click a glowing pin on the globe</b>, or choose below. The globe flies there, then you choose how to look at its fires: a 3D skyline, a map or a calendar, for every month since 2002.</p>
      <div className="mt-4 grid grid-cols-2 gap-1.5">
        {REGIONS.map((r) => (
          <button key={r.id} className="btn text-left" onClick={() => pick(r.id)}>
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-fire shadow-[0_0_8px_#FF6B35]" />{r.name}
          </button>
        ))}
      </div>
      <div className="mt-4 label">Featured stories</div>
      <div className="mt-2 space-y-1.5">
        {CASES.map((c) => (
          <button key={c.id} className="btn w-full text-left" onClick={() => pickCase(c.id)}>
            <div className="text-[14px]">{c.title}</div>
            <div className="text-[11px] text-slate-500">{c.kicker}</div>
          </button>
        ))}
      </div>
    </>
  );
}

function StoryInner() {
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [flat, setFlat] = useState(false);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const d = useIndonesia();

  // chapter 9 state: which area the visitor picked
  const initCase = CASES.find((c) => c.id === params.get("case"));
  const initCountry = params.get("country");
  const [area, setArea] = useState<string | null>(initCase ? `case:${initCase.id}` : initCountry ? `country:${initCountry}` : null);
  const [ym, setYm] = useState(initCase ? { y: initCase.year, m: initCase.month } : LATEST);
  const [mapOn, setMapOn] = useState(false);
  // after a region is picked, let the Spline camera fly there (~1.4 s), then hand over to the real map
  useEffect(() => {
    setMapOn(false);
    if (!area || step !== EXPLORE) return;
    const t = setTimeout(() => setMapOn(true), flat ? 0 : 1500);
    return () => clearTimeout(t);
  }, [area, step, flat]);

  useEffect(() => {
    api.health().catch(() => {}); // wake the backend early
    setFlat(window.innerWidth < 1024);
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setStep(Number((e.target as HTMLElement).dataset.i))),
      { rootMargin: "-45% 0px -45% 0px" }
    );
    refs.current.forEach((r) => r && io.observe(r));
    const onRej = (e: PromiseRejectionEvent) => {
      if (String(e.reason).includes("fetch") || String(e.reason).toLowerCase().includes("spline")) { e.preventDefault(); setFlat(true); setLoaded(true); }
    };
    window.addEventListener("unhandledrejection", onRej);
    const giveUp = setTimeout(() => setLoaded(true), 20000);
    // deep link: /#explore or ?case= / ?country= jumps straight to chapter 9
    if (window.location.hash === "#explore" || initCase || initCountry) {
      setTimeout(() => refs.current[EXPLORE]?.scrollIntoView({ behavior: "auto", block: "start" }), 300);
    }
    return () => { io.disconnect(); window.removeEventListener("unhandledrejection", onRej); clearTimeout(giveUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = useCallback((id: string) => {
    const r = REGIONS.find((x) => x.id === id);
    if (r) { setArea(r.areaKey); setYm(LATEST); }
  }, []);
  const pickCase = (id: string) => {
    const c = CASES.find((x) => x.id === id)!;
    setArea(`case:${c.id}`); setYm({ y: c.year, m: c.month });
  };
  const onStateChange = useCallback((v: string) => {
    if (!v?.startsWith("Explore_") || v === "Explore_Overview") return;
    const id = v.slice("Explore_".length);
    setStep((s) => {
      if (s === EXPLORE) setArea((cur) => (cur && pinForArea(cur) === id ? cur : REGIONS.find((r) => r.id === id)?.areaKey ?? cur));
      return s;
    });
  }, []);

  const scene = step === EXPLORE ? (area ? `Explore_${pinForArea(area)}` : "Explore_Overview") : CHAPTERS[step].scene;

  return (
    <main className="relative">
      <div className="fixed inset-0 z-0">
        {flat ? (
          <div className="h-full w-full bg-[radial-gradient(circle_at_68%_45%,#16305a_0%,#0B0F1A_60%)]" />
        ) : (
          <ErrorBoundary fallback={null} onError={() => { setFlat(true); setLoaded(true); }}>
            <SplineScene state={scene} onLoaded={() => setLoaded(true)} onStateChange={onStateChange} />
          </ErrorBoundary>
        )}
      </div>
      {!loaded && !flat && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-space">
          <div className="text-center">
            <div className="mx-auto mb-4 h-3 w-3 animate-ping rounded-full bg-fire" />
            <p className="text-slate-400">Waking up 5 satellites…</p>
          </div>
        </div>
      )}

      {/* chapter dots */}
      <nav className={`fixed left-4 top-1/2 z-30 ${mapOn ? "!hidden" : ""} hidden -translate-y-1/2 flex-col gap-2 md:flex`} aria-label="Chapters">
        {CHAPTERS.map((c, i) => (
          <button key={i} title={c.kicker} onClick={() => refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className={`h-2.5 w-2.5 rounded-full ${i === step ? "bg-fire" : i >= 5 ? "bg-sat/40" : "bg-white/25"}`} />
        ))}
      </nav>
        <div className="fixed bottom-3 right-3 z-[25] flex h-[112px] w-[410px] flex-col justify-center gap-2 rounded-2xl border border-line bg-[#0B0F1A] px-5">
          {step < EXPLORE ? (
            <button className="btn self-start bg-space" onClick={() => refs.current[EXPLORE]?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              Skip to explore ↓
            </button>
          ) : (
            <div className="text-sm font-semibold text-white">Pick a region to dive in</div>
          )}
          <div className="text-[11px] leading-snug text-slate-500">
            Fire data: NASA FIRMS (MODIS, VIIRS) · Earth: NASA Blue Marble · 3D globe made with Spline
          </div>
        </div>
      )}

      {/* left reading column on a dark gradient; the globe stays visible on the right */}
      <div className="pointer-events-none relative z-20">
        {CHAPTERS.map((c, i) => (
          <section key={i} id={i === EXPLORE ? "explore" : undefined} ref={(el) => { refs.current[i] = el; }} data-i={i}
            className={`flex ${c.explore ? "min-h-screen items-start pt-16" : "min-h-screen items-center"} px-6 md:pl-14`}>
            {!(c.explore && area) && <div className={`pointer-events-auto w-full ${c.chart || c.explore ? "max-w-[560px]" : "max-w-md"} transition-opacity duration-500 ${i === step ? "opacity-100" : "opacity-35"}`}>
              <div className="card p-6">
                <div className={`label ${i >= 5 ? "text-sat" : "text-fire"}`}>{c.kicker}</div>
                {c.title && <h2 className="mt-2 text-2xl font-semibold leading-snug">{c.title}</h2>}
                {c.body && <p className="mt-3 text-[15px] leading-relaxed text-slate-300">{c.body}</p>}
                {c.chart && <ExampleCard chart={c.chart} d={d} />}
                {c.explore && <RegionPicker pick={pick} pickCase={pickCase} />}
              </div>
            </div>}
          </section>
        ))}
        <div className="h-[20vh]" />
      </div>

      {/* chapter 9, region picked: the real map of the region takes over from the globe */}
      {step === EXPLORE && area && !mapOn && (
        <div className="pointer-events-none fixed inset-x-0 bottom-10 z-30 text-center text-sm text-slate-300 [text-shadow:0_1px_6px_#000]">
          Flying to {labelForArea(area)}…
        </div>
      )}
      {area && mapOn && <RegionExplorer key={area} area={area} initYm={ym} onBack={() => setArea(null)} />}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="pt-24 text-center text-slate-400">Loading…</div>}>
      <StoryInner />
    </Suspense>
  );
}
