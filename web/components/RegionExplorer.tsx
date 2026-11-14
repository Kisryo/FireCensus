"use client";
// Chapter 9, after a region is picked: the Spline globe zooms to the region, then this real map
// (MapLibre globe projection, NASA Blue Marble imagery) fades in on top of it and flies down onto
// the region. Fires are drawn on the map itself: flat cells, or 3D towers rising from the ground.
// A docked panel adds the year x month calendar / skyline. Replaces the old overlay and /explore/advanced.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { api, type Cell, type Compare, type SeriesRow } from "@/lib/api";
import { boundsForArea, labelForArea, regionForArea } from "@/lib/regions";
import { MONTHS, fmt, viridis, rdbu, VIRIDIS_STOPS, RDBU_STOPS } from "@/lib/colors";
import CalendarHeatmap from "@/components/CalendarHeatmap";
import type { Grid, Preset } from "@/components/Skyline3D";

try { (maplibregl as any).setWorkerUrl?.("/maplibre/maplibre-gl-worker.mjs"); } catch {}
const Skyline3D = dynamic(() => import("@/components/Skyline3D"), { ssr: false });

// NASA GIBS Blue Marble (public, no key). If it can't load, the land outlines underneath still show.
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
const EMPTY = { type: "FeatureCollection", features: [] } as any;
const STYLE: any = {
  version: 8,
  projection: { type: "globe" },
  sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 0.6, 6, 0] },
  sources: {
    imagery: { type: "raster", tiles: [GIBS], tileSize: 256, maxzoom: 8, attribution: "Imagery: NASA GIBS Blue Marble · Fires: NASA FIRMS, FireCensus" },
    countries: { type: "geojson", data: "/sea-countries.geojson" },
    cells: { type: "geojson", data: EMPTY },
    area: { type: "geojson", data: EMPTY },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#050913" } },
    { id: "land", type: "fill", source: "countries", paint: { "fill-color": "#1b2a45" } },
    { id: "imagery", type: "raster", source: "imagery", paint: { "raster-brightness-max": 0.75, "raster-saturation": -0.25 } },
    { id: "borders", type: "line", source: "countries", paint: { "line-color": "#ffffff", "line-opacity": 0.35, "line-width": 0.8 } },
    { id: "area", type: "line", source: "area", paint: { "line-color": "#4FC3F7", "line-width": 1.5, "line-dasharray": [2, 2] } },
    { id: "cells-2d", type: "fill", source: "cells", paint: { "fill-color": ["get", "c"], "fill-opacity": 0.85 } },
    { id: "cells-3d", type: "fill-extrusion", source: "cells", layout: { visibility: "none" },
      paint: { "fill-extrusion-color": ["get", "c"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.9 } },
  ],
};

type Mode = "flat" | "towers";
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const k = (s.length - 1) / 2;
  return (s[Math.floor(k)] + s[Math.ceil(k)]) / 2;
};

export default function RegionExplorer({ area, initYm, onBack }: { area: string; initYm: { y: number; m: number }; onBack: () => void }) {
  const region = useMemo(() => regionForArea(area), [area]);
  const bounds = useMemo(() => boundsForArea(area), [area]);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("flat");
  const [anomaly, setAnomaly] = useState(false);
  const [picked, setPicked] = useState(initYm);
  const [cells, setCells] = useState<Cell[]>([]);
  const [cellNote, setCellNote] = useState<string | null>(null);
  const [cmp, setCmp] = useState<Compare | null>(null);
  const [hoverCell, setHoverCell] = useState<{ n: number; med: number } | null>(null);
  const [dock, setDock] = useState<null | "calendar" | "skyline">(null);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [hoverYm, setHoverYm] = useState<{ y: number; m: number } | null>(null);
  const [preset, setPreset] = useState<Preset>("iso");
  const res = picked.y < 2012 ? 0.5 : 0.25;

  // ---------- map: start on the whole globe, then fly down onto the region ----------
  useEffect(() => {
    if (!el.current) return;
    const [w, s, e, n] = bounds;
    const m = new maplibregl.Map({
      container: el.current, style: STYLE, center: [(w + e) / 2, (s + n) / 2], zoom: 1.6,
      attributionControl: { compact: true }, maxPitch: 70,
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    m.on("load", () => {
      (m.getSource("area") as any)?.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {},
        geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }] });
      setReady(true);
      m.fitBounds([[w, s], [e, n]], { padding: { top: 90, bottom: 170, left: 60, right: 60 }, duration: 2600, essential: true, maxZoom: 7.5 });
    });
    const hover = (ev: any) => {
      const f = ev.features?.[0];
      if (f) setHoverCell({ n: f.properties.n, med: f.properties.med });
      m.getCanvas().style.cursor = f ? "pointer" : "";
    };
    const leave = () => { setHoverCell(null); m.getCanvas().style.cursor = ""; };
    m.on("mousemove", "cells-2d", hover); m.on("mouseleave", "cells-2d", leave);
    m.on("mousemove", "cells-3d", hover); m.on("mouseleave", "cells-3d", leave);
    map.current = m;
    return () => m.remove();
  }, [bounds]);

  // flat cells vs 3D towers (tilt the camera for towers). Skip the first run so the fly-in isn't cancelled.
  const firstMode = useRef(true);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.setLayoutProperty("cells-2d", "visibility", mode === "flat" ? "visible" : "none");
    m.setLayoutProperty("cells-3d", "visibility", mode === "towers" ? "visible" : "none");
    if (firstMode.current) { firstMode.current = false; return; }
    m.easeTo({ pitch: mode === "towers" ? 58 : 0, bearing: mode === "towers" ? -18 : 0, duration: 1400 });
  }, [mode, ready]);

  // ---------- data ----------
  useEffect(() => {
    api.cells(picked.y, picked.m, res, region.country ? { country: region.country } : {})
      .then((r) => { setCells(r.cells); setCellNote(r.note); }).catch(() => setCells([]));
    api.compare(region, picked.y, picked.m).then(setCmp).catch(() => setCmp(null));
  }, [region, picked, res]);

  useEffect(() => {
    if (!dock || series.length) return;
    api.timeseries(region, "2002-07", "2026-11").then((t) => setSeries(t.series)).catch(() => {});
  }, [dock, region, series.length]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const max = Math.max(1, ...cells.map((c) => c.n_hat));
    const h = res / 2;
    const features = cells.filter((c) => c.n_hat > 0 || anomaly).map((c) => ({
      type: "Feature",
      properties: {
        n: Math.round(c.n_hat), med: Math.round(c.n_median),
        c: anomaly ? rdbu((c.n_hat + 1) / (c.n_median + 1)) : viridis(Math.log1p(c.n_hat) / Math.log1p(max)),
        h: Math.sqrt(c.n_hat / max) * 260000 * (res / 0.25),
      },
      geometry: { type: "Polygon", coordinates: [[[c.lon - h, c.lat - h], [c.lon + h, c.lat - h], [c.lon + h, c.lat + h], [c.lon - h, c.lat + h], [c.lon - h, c.lat - h]]] },
    }));
    (m.getSource("cells") as any)?.setData({ type: "FeatureCollection", features });
  }, [cells, anomaly, res, ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (dock) setDock(null); else onBack(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dock, onBack]);

  // ---------- year x month grid for the dock ----------
  const idx = useMemo(() => {
    const m = new Map<string, SeriesRow>();
    series.forEach((r) => m.set(`${r.year}-${r.month}`, r));
    return m;
  }, [series]);
  const grid: Grid | null = useMemo(() => {
    if (!series.length) return null;
    const years = Array.from(new Set(series.map((r) => r.year))).sort();
    const med = new Map<number, number>();
    for (let k = 1; k <= 12; k++) med.set(k, median(series.filter((r) => r.month === k && r.year >= 2003 && r.year <= 2025).map((r) => r.n_hat)));
    const v = (y: number, k: number) => idx.get(`${y}-${k}`)?.n_hat ?? 0;
    return { years, value: v, fc: v, raw: (y, k) => idx.get(`${y}-${k}`)?.aqua_raw ?? 0, ratio: (y, k) => (v(y, k) + 1) / ((med.get(k) ?? 0) + 1) };
  }, [series, idx]);
  const hv = hoverYm ? idx.get(`${hoverYm.y}-${hoverYm.m}`) : undefined;
  const ym = `${picked.y}-${String(picked.m).padStart(2, "0")}`;
  const years = Array.from({ length: 25 }, (_, i) => 2002 + i);

  return (
    <div className="fixed inset-0 top-12 z-30 animate-[fadeIn_0.7s_ease-out]">
      <div ref={el} className="absolute inset-0" />

      {/* top: back + region */}
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-3">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-space/80 py-1.5 pl-1.5 pr-5 backdrop-blur">
          <button className="btn rounded-full py-1 text-sm" onClick={onBack} title="Back to the globe (Esc)">← Globe</button>
          <div>
            <div className="text-lg font-semibold leading-tight">{labelForArea(area)}</div>
            <div className="text-[11px] text-slate-400">Every fire, including the ones no satellite saw · {MONTHS[picked.m - 1]} {picked.y}</div>
          </div>
        </div>
      </div>

      {hoverCell && (
        <div className="card pointer-events-none absolute right-16 top-4 p-3 text-sm">
          <div className="num text-lg font-semibold">{fmt(hoverCell.n)} fires</div>
          <div className="text-xs text-slate-400">in this {res}° cell · typical {MONTHS[picked.m - 1]}: {fmt(hoverCell.med)}</div>
        </div>
      )}

      {/* docked year x month panel */}
      {dock && (
        <div className="card absolute bottom-[150px] right-4 top-20 flex w-[min(560px,46vw)] flex-col overflow-hidden">
          <div className="flex items-center gap-1 border-b border-line px-3 py-2">
            {(["calendar", "skyline"] as const).map((d) => (
              <button key={d} className={`btn py-1 text-sm ${dock === d ? "btn-on" : ""}`} onClick={() => setDock(d)}>
                {d === "calendar" ? "Season calendar" : "3D skyline"}
              </button>
            ))}
            {dock === "skyline" && (["iso", "front", "side", "top"] as Preset[]).map((p) => (
              <button key={p} className={`btn px-2 py-1 text-xs ${preset === p ? "btn-on" : ""}`} onClick={() => setPreset(p)}>{p === "iso" ? "Iso" : p === "front" ? "Seasons" : p === "side" ? "Years" : "Top"}</button>
            ))}
            <button className="btn ml-auto px-2 py-1" onClick={() => setDock(null)} aria-label="Close panel">✕</button>
          </div>
          <div className="relative min-h-0 flex-1">
            {!grid ? <div className="flex h-full items-center justify-center text-slate-400">Counting fires…</div>
              : dock === "calendar" ? <CalendarHeatmap grid={grid} anomaly={anomaly} log={false} selected={picked} onHover={setHoverYm} onPick={setPicked} />
              : <Skyline3D grid={grid} preset={preset} log={false} anomaly={anomaly} recovered={false} fixedScale={false} onHover={setHoverYm} onPick={setPicked} />}
            {hv && (
              <div className="card pointer-events-none absolute left-3 top-3 p-2 text-xs">
                <b>{MONTHS[hv.month - 1]} {hv.year}</b>: <span className="num">{fmt(hv.n_hat)}</span> fires
              </div>
            )}
          </div>
          <p className="border-t border-line px-3 py-1.5 text-[11px] text-slate-500">Rows are years, columns are months. Click one to show that month on the map.</p>
        </div>
      )}

      {/* bottom control bar */}
      <div className="absolute inset-x-4 bottom-9">
        <div className="card mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2 bg-space/85 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-1">
            <select value={picked.m} onChange={(e) => setPicked({ ...picked, m: Number(e.target.value) })} aria-label="Month">
              {MONTHS.map((mm, i) => <option key={mm} value={i + 1}>{mm}</option>)}
            </select>
            <select className="num" value={picked.y} onChange={(e) => setPicked({ ...picked, y: Number(e.target.value) })} aria-label="Year">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {cmp && cmp.year === picked.y && cmp.month === picked.m ? (
            <div className="text-sm">
              <b className="num text-base text-white">{fmt(cmp.n_hat)}</b> fires ·{" "}
              <b className={cmp.ratio_to_median >= 1.5 ? "text-fire" : cmp.ratio_to_median <= 0.67 ? "text-sat" : ""}>{cmp.ratio_to_median}×</b> a typical {MONTHS[cmp.month - 1]}
              <span className={`ml-2 rounded px-2 py-0.5 text-xs ${cmp.status === "above normal" ? "bg-fire/20 text-fire" : cmp.status === "below normal" ? "bg-sat/20 text-sat" : "bg-white/10"}`}>{cmp.status}</span>
            </div>
          ) : <span className="text-sm text-slate-500">Counting…</span>}

          <div className="flex gap-1 rounded-xl border border-line p-1">
            <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "flat" ? "bg-fire text-black" : "text-slate-300 hover:bg-white/5"}`} onClick={() => setMode("flat")}>Map</button>
            <button className={`rounded-lg px-3 py-1.5 text-sm ${mode === "towers" ? "bg-fire text-black" : "text-slate-300 hover:bg-white/5"}`} onClick={() => setMode("towers")}>3D towers</button>
            <button className={`rounded-lg px-3 py-1.5 text-sm ${dock ? "bg-sat text-black" : "text-slate-300 hover:bg-white/5"}`} onClick={() => setDock(dock ? null : "calendar")}>Calendar & skyline</button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-300">
            <input type="checkbox" checked={anomaly} onChange={(e) => setAnomaly(e.target.checked)} /> Compare with a normal year
          </label>
          <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
            <span>{anomaly ? "¼× normal" : "few"}</span>
            <span className="h-2.5 w-24 rounded" style={{ background: `linear-gradient(90deg, ${(anomaly ? RDBU_STOPS : VIRIDIS_STOPS).join(",")})` }} />
            <span>{anomaly ? "4× normal" : "many fires"}</span>
            <a className="ml-2 text-sat underline" href={api.csvCells(region.country ? { country: region.country } : region, ym, ym)}>⬇ CSV</a>
          </div>
          {cellNote && <p className="w-full text-[11px] text-slate-500">{cellNote}</p>}
        </div>
      </div>
    </div>
  );
}
