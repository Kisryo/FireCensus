"use client";
// Chapter 9 of the story: after a visitor picks a region, the globe zooms in and three view
// options float over it (RegionOptions). Each opens a large overlay over the globe (RegionViews):
// 3D skyline, map, burning calendar. Replaces the old /explore/advanced page.
import dynamic from "next/dynamic";
import React, { useEffect, useMemo, useState } from "react";
import { api, type Cell, type Compare, type SeriesRow } from "@/lib/api";
import { labelForArea, regionForArea } from "@/lib/regions";
import { MONTHS, fmt, VIRIDIS_STOPS, RDBU_STOPS } from "@/lib/colors";
import CalendarHeatmap from "@/components/CalendarHeatmap";
import type { Grid, Preset } from "@/components/Skyline3D";

const Skyline3D = dynamic(() => import("@/components/Skyline3D"), { ssr: false });
const RegionMap = dynamic(() => import("@/components/RegionMap"), { ssr: false });

export type View = "skyline" | "map" | "calendar";
const VIEWS: { id: View; title: string; hint: string; icon: React.ReactElement }[] = [
  {
    id: "skyline", title: "3D skyline", hint: "Every month since 2002 as a tower",
    icon: <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="5" width="4" height="16" rx="1" /><rect x="17" y="9" width="4" height="12" rx="1" /></svg>,
  },
  {
    id: "map", title: "Map", hint: "Where the fires were, month by month",
    icon: <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></svg>,
  },
  {
    id: "calendar", title: "Calendar", hint: "The fire season at a glance",
    icon: <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><rect x="7" y="13" width="3" height="3" fill="currentColor" stroke="none" /><rect x="14" y="16" width="3" height="3" fill="currentColor" stroke="none" /></svg>,
  },
];
const PRESETS: { id: Preset; label: string }[] = [
  { id: "iso", label: "Isometric" },
  { id: "front", label: "Seasons" },
  { id: "side", label: "Years" },
  { id: "top", label: "Top" },
];

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const k = (s.length - 1) / 2;
  return (s[Math.floor(k)] + s[Math.ceil(k)]) / 2;
};

/** Floating over the zoomed-in globe: region name and the three view options. */
export function RegionOptions({ area, onOpen, onBack }: { area: string; onOpen: (v: View) => void; onBack: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 top-14 z-30 flex flex-col items-center justify-between px-6 pb-10 lg:left-[34%]">
      <div className="pointer-events-auto mt-4 flex items-center gap-3 rounded-full border border-line bg-space/75 py-1.5 pl-1.5 pr-5 backdrop-blur">
        <button className="btn rounded-full py-1 text-sm" onClick={onBack}>← All regions</button>
        <span className="text-lg font-semibold">{labelForArea(area)}</span>
      </div>
      <div className="pointer-events-auto w-full max-w-[720px]">
        <p className="mb-3 text-center text-sm text-slate-300 [text-shadow:0_1px_6px_#000]">How do you want to look at its fires?</p>
        <div className="grid grid-cols-3 gap-3">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => onOpen(v.id)}
              className="group rounded-2xl border border-line bg-space/80 p-4 text-left backdrop-blur transition hover:-translate-y-1 hover:border-fire/70 hover:bg-space/90 hover:shadow-[0_0_30px_-8px_#FF6B35]">
              <div className="text-fire transition group-hover:scale-110">{v.icon}</div>
              <div className="mt-2 text-[17px] font-semibold">{v.title}</div>
              <div className="mt-0.5 text-[12px] leading-snug text-slate-400">{v.hint}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Large overlay over the globe with the chosen view. */
export default function RegionViews({ area, view, onView, onClose, initYm }: {
  area: string; view: View; onView: (v: View) => void; onClose: () => void; initYm: { y: number; m: number };
}) {
  const region = useMemo(() => regionForArea(area), [area]);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [picked, setPicked] = useState(initYm);
  const [hover, setHover] = useState<{ y: number; m: number } | null>(null);
  const [preset, setPreset] = useState<Preset>("iso");
  const [anomaly, setAnomaly] = useState(false);
  const [cmp, setCmp] = useState<Compare | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [cellNote, setCellNote] = useState<string | null>(null);

  useEffect(() => {
    setStatus("loading");
    api.timeseries(region, "2002-07", "2026-11")
      .then((t) => { setSeries(t.series); setStatus(t.series.some((r) => r.n_hat > 0) ? "ready" : "error"); })
      .catch(() => setStatus("error"));
  }, [region]);

  useEffect(() => {
    api.compare(region, picked.y, picked.m).then(setCmp).catch(() => setCmp(null));
  }, [region, picked]);

  useEffect(() => {
    if (view !== "map") return;
    const res = picked.y < 2012 ? 0.5 : 0.25;
    api.cells(picked.y, picked.m, res, region.country ? { country: region.country } : {})
      .then((r) => { setCells(r.cells); setCellNote(r.note); }).catch(() => setCells([]));
  }, [view, region, picked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const idx = useMemo(() => {
    const m = new Map<string, SeriesRow>();
    series.forEach((r) => m.set(`${r.year}-${r.month}`, r));
    return m;
  }, [series]);

  const grid: Grid | null = useMemo(() => {
    if (!series.length) return null;
    const years = Array.from(new Set(series.map((r) => r.year))).sort();
    const med = new Map<number, number>();
    for (let m = 1; m <= 12; m++) med.set(m, median(series.filter((r) => r.month === m && r.year >= 2003 && r.year <= 2025).map((r) => r.n_hat)));
    const v = (y: number, m: number) => idx.get(`${y}-${m}`)?.n_hat ?? 0;
    return { years, value: v, fc: v, raw: (y, m) => idx.get(`${y}-${m}`)?.aqua_raw ?? 0, ratio: (y, m) => (v(y, m) + 1) / ((med.get(m) ?? 0) + 1) };
  }, [series, idx]);

  const hv = hover ? idx.get(`${hover.y}-${hover.m}`) : undefined;
  const years = grid?.years ?? [];
  const ym = `${picked.y}-${String(picked.m).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05080f]/70 p-3 backdrop-blur-sm md:p-6" onClick={onClose}>
      <div className="card relative flex h-full w-full max-w-[1500px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="mr-3">
            <div className="label text-sat">Fire record 2002–2026</div>
            <div className="text-lg font-semibold">{labelForArea(area)}</div>
          </div>
          <div className="flex gap-1 rounded-xl border border-line p-1">
            {VIEWS.map((v) => (
              <button key={v.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${view === v.id ? "bg-fire text-black" : "text-slate-300 hover:bg-white/5"}`} onClick={() => onView(v.id)}>
                <span className="[&_svg]:h-4 [&_svg]:w-4">{v.icon}</span>{v.title}
              </button>
            ))}
          </div>
          {view === "skyline" && (
            <div className="flex gap-1">
              {PRESETS.map((p) => <button key={p.id} className={`btn py-1 text-xs ${preset === p.id ? "btn-on" : ""}`} onClick={() => setPreset(p.id)}>{p.label}</button>)}
            </div>
          )}
          <label className="ml-1 flex items-center gap-1.5 text-xs text-slate-300">
            <input type="checkbox" checked={anomaly} onChange={(e) => setAnomaly(e.target.checked)} /> Compare with a normal year
          </label>
          <Legend anomaly={anomaly} />
          <button className="btn ml-2 px-3 text-lg leading-none" onClick={onClose} aria-label="Close (Esc)" title="Back to the globe (Esc)">✕</button>
        </div>

        {/* view */}
        <div className="relative min-h-0 flex-1">
          {status === "loading" ? (
            <div className="flex h-full items-center justify-center text-slate-400">Counting fires…</div>
          ) : status === "error" || !grid ? (
            <div className="flex h-full items-center justify-center text-slate-300">Can&apos;t reach the FireCensus API. Is the backend running?</div>
          ) : view === "skyline" ? (
            <Skyline3D grid={grid} preset={preset} log={false} anomaly={anomaly} recovered={false} fixedScale={false} onHover={setHover} onPick={setPicked} />
          ) : view === "calendar" ? (
            <CalendarHeatmap grid={grid} anomaly={anomaly} log={false} selected={picked} onHover={setHover} onPick={setPicked} />
          ) : (
            <RegionMap cells={cells} res={picked.y < 2012 ? 0.5 : 0.25} anomaly={anomaly} bbox={region.bbox} noDraw fitKey={area} />
          )}

          {hv && view !== "map" && (
            <div className="card pointer-events-none absolute right-4 top-4 w-60 p-3 text-sm">
              <div className="mb-1 font-semibold">{MONTHS[hv.month - 1]} {hv.year}</div>
              <Row k="Fires (FireCensus)" v={fmt(hv.n_hat)} strong />
              <Row k="Seen by MODIS alone" v={fmt(hv.aqua_raw)} />
              <p className="mt-1 text-[11px] text-slate-500">Click to pick this month.</p>
            </div>
          )}
          {view === "map" && cellNote && <div className="card absolute bottom-4 left-4 max-w-md p-2 text-[11px] text-slate-400">{cellNote}</div>}
        </div>

        {/* footer: the picked month */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-sm">
          <div className="flex items-center gap-1">
            <select value={picked.m} onChange={(e) => setPicked({ ...picked, m: Number(e.target.value) })} aria-label="Month">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select className="num" value={picked.y} onChange={(e) => setPicked({ ...picked, y: Number(e.target.value) })} aria-label="Year">
              {(years.length ? years : [picked.y]).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {cmp && cmp.year === picked.y && cmp.month === picked.m ? (
            <div>
              <b className="num text-white">{fmt(cmp.n_hat)}</b> fires ·{" "}
              <b className={cmp.ratio_to_median >= 1.5 ? "text-fire" : cmp.ratio_to_median <= 0.67 ? "text-sat" : ""}>{cmp.ratio_to_median}×</b> a typical {MONTHS[cmp.month - 1]}
              <span className={`ml-2 rounded px-2 py-0.5 text-xs ${cmp.status === "above normal" ? "bg-fire/20 text-fire" : cmp.status === "below normal" ? "bg-sat/20 text-sat" : "bg-white/10"}`}>{cmp.status}</span>
            </div>
          ) : <span className="text-slate-500">–</span>}
          <span className="text-xs text-slate-500">
            {view === "map" ? "The map shows the month you pick here." : "Click a tower or cell to pick a month; the map follows it."}
          </span>
          <div className="ml-auto flex gap-3 text-xs">
            <a className="text-sat underline" href={api.csvTimeseries(region, "2002-07", "2026-11")}>⬇ Monthly CSV</a>
            <a className="text-sat underline" href={api.csvCells(region.country ? { country: region.country } : region, ym, ym)}>⬇ Map cells CSV</a>
          </div>
        </div>
      </div>
    </div>
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
      <span>{anomaly ? "¼× normal" : "few"}</span>
      <span className="h-2.5 w-24 rounded" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }} />
      <span>{anomaly ? "4× normal" : "many fires"}</span>
    </div>
  );
}
