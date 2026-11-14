"use client";
// Chapter 9, after a region is picked: the Spline globe zooms to the region, then this real map
// (MapLibre globe projection, NASA Blue Marble imagery) fades in and flies down onto the region.
// It lets the visitor *see* why the harmonized count is trustworthy:
//   ① Satellite lens: what each satellite alone saw vs FireCensus (same colour scale, so gaps show).
//   ③ Play 2002–2026: yearly map + two counters. Raw "newest satellite" jumps ×4 in 2012; FireCensus doesn't.
//   ④ Zoom in: every single detected fire, with which satellites saw it and how many fires it stands for.
// Plus flat cells / 3D towers, finer cells when zoomed in, and a docked calendar / skyline panel.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { API, api, type Cell, type Compare, type SeriesRow } from "@/lib/api";
import { boundsForArea, labelForArea, regionForArea } from "@/lib/regions";
import { MONTHS, fmt, viridis, rdbu, VIRIDIS_STOPS, RDBU_STOPS } from "@/lib/colors";
import CalendarHeatmap from "@/components/CalendarHeatmap";
import type { Grid, Preset } from "@/components/Skyline3D";

try { (maplibregl as any).setWorkerUrl?.("/maplibre/maplibre-gl-worker.mjs"); } catch {}
const Skyline3D = dynamic(() => import("@/components/Skyline3D"), { ssr: false });

// NASA GIBS Blue Marble (public, no key). If it can't load, the land outlines underneath still show.
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
const EMPTY = { type: "FeatureCollection", features: [] } as any;
const DOTS_ZOOM = 6.5; // individual fires from this zoom
const FINE_ZOOM = 5.5; // 0.1° cells from this zoom
const STYLE: any = {
  version: 8,
  projection: { type: "globe" },
  sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 0.6, 6, 0] },
  sources: {
    imagery: { type: "raster", tiles: [GIBS], tileSize: 256, maxzoom: 8, attribution: "Imagery: NASA GIBS Blue Marble · Fires: NASA FIRMS, FireCensus" },
    countries: { type: "geojson", data: "/sea-countries.geojson" },
    cells: { type: "geojson", data: EMPTY },
    fires: { type: "geojson", data: EMPTY },
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
    // ④ every fire: a soft halo sized by how many fires it stands for, and a bright core for the detection itself
    { id: "fire-halo", type: "circle", source: "fires", minzoom: DOTS_ZOOM,
      paint: { "circle-color": "#FF6B35", "circle-opacity": 0.28, "circle-blur": 0.6,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6.5, ["*", 2.2, ["sqrt", ["get", "w"]]], 10, ["*", 6, ["sqrt", ["get", "w"]]]] } },
    { id: "fire-core", type: "circle", source: "fires", minzoom: DOTS_ZOOM,
      paint: { "circle-color": "#FFE3C2", "circle-stroke-color": "#FF6B35", "circle-stroke-width": 0.8,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6.5, 1.6, 10, 4] } },
  ],
};

type Display = "flat" | "towers";
type Lens = "fc" | "aqua" | "snpp" | "noaa20" | "seen";
type YLens = "n_hat" | "naive" | "aqua";
const LENSES: { id: Lens; label: string; sub: string }[] = [
  { id: "aqua", label: "Aqua", sub: "MODIS · 1 km" },
  { id: "snpp", label: "S-NPP", sub: "VIIRS · 375 m" },
  { id: "noaa20", label: "NOAA-20", sub: "VIIRS · 375 m" },
  { id: "seen", label: "Any satellite", sub: "seen at least once" },
  { id: "fc", label: "FireCensus", sub: "+ fires nobody saw" },
];
const YLENSES: { id: YLens; label: string }[] = [
  { id: "naive", label: "Newest satellite (raw)" },
  { id: "aqua", label: "Aqua only (raw)" },
  { id: "n_hat", label: "FireCensus" },
];
type YearsData = { years: number[]; cells: [number, number][]; n_hat: number[][]; naive: number[][]; aqua: number[][]; res: number; note: string };
type Fire = { lat: number; lon: number; frp: number; a: number; s: number; n: number; w: number; wf: number };

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const k = (s.length - 1) / 2;
  return (s[Math.floor(k)] + s[Math.ceil(k)]) / 2;
};
const square = (lon: number, lat: number, h: number) => [[[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]];
const lensValue = (c: any, l: Lens): number => (l === "fc" ? c.n_hat : l === "seen" ? c.n_obs : l === "aqua" ? c.aqua_raw : l === "snpp" ? c.snpp_raw : c.noaa20_raw) ?? 0;
const rowValue = (r: SeriesRow | undefined, l: Lens) => !r ? 0 : l === "fc" ? r.n_hat : l === "seen" ? r.n_obs : l === "aqua" ? (r.aqua_raw ?? 0) : l === "snpp" ? (r.snpp_raw ?? 0) : (r.noaa20_raw ?? 0);
const flying = (l: Lens, y: number, m: number) => {
  const t = y * 100 + m;
  if (l === "snpp") return t >= 201201 && t <= 202611;
  if (l === "noaa20") return t >= 201801;
  return true;
};

export default function RegionExplorer({ area, initYm, onBack }: { area: string; initYm: { y: number; m: number }; onBack: () => void }) {
  const region = useMemo(() => regionForArea(area), [area]);
  const bounds = useMemo(() => boundsForArea(area), [area]);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1.6);
  const [display, setDisplay] = useState<Display>("flat");
  const [anomaly, setAnomaly] = useState(false);
  const [picked, setPicked] = useState(initYm);
  const [lens, setLens] = useState<Lens>("fc");
  const [cells, setCells] = useState<Cell[]>([]);
  const [cellNote, setCellNote] = useState<string | null>(null);
  const [cmp, setCmp] = useState<Compare | null>(null);
  const [hoverCell, setHoverCell] = useState<{ v: number; fc: number; med: number } | null>(null);
  const [hoverFire, setHoverFire] = useState<Fire | null>(null);
  const [fires, setFires] = useState<{ n: number; truncated: boolean } | null>(null);
  const [dock, setDock] = useState<null | "calendar" | "skyline">(null);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [hoverYm, setHoverYm] = useState<{ y: number; m: number } | null>(null);
  const [preset, setPreset] = useState<Preset>("iso");
  // ③ timelapse
  const [mode, setMode] = useState<"month" | "years">("month");
  const [yd, setYd] = useState<YearsData | null>(null);
  const [yi, setYi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ylens, setYlens] = useState<YLens>("naive");

  const fine = zoom >= FINE_ZOOM;
  const res = picked.y < 2012 ? (fine ? 0.25 : 0.5) : (fine ? 0.1 : 0.25);

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
      m.fitBounds([[w, s], [e, n]], { padding: { top: 190, bottom: 170, left: 60, right: 60 }, duration: 2600, essential: true, maxZoom: 7.5 });
    });
    m.on("zoomend", () => setZoom(m.getZoom()));
    const cellHover = (ev: any) => {
      const f = ev.features?.[0];
      if (f) setHoverCell({ v: f.properties.v, fc: f.properties.fc, med: f.properties.med });
      m.getCanvas().style.cursor = f ? "pointer" : "";
    };
    const cellLeave = () => { setHoverCell(null); m.getCanvas().style.cursor = ""; };
    ["cells-2d", "cells-3d"].forEach((l) => { m.on("mousemove", l, cellHover); m.on("mouseleave", l, cellLeave); });
    m.on("mousemove", "fire-core", (ev: any) => { const p = ev.features?.[0]?.properties; if (p) setHoverFire(p as Fire); });
    m.on("mouseleave", "fire-core", () => setHoverFire(null));
    map.current = m;
    return () => m.remove();
  }, [bounds]);

  // flat cells vs 3D towers (tilt the camera for towers). Skip the first run so the fly-in isn't cancelled.
  const firstDisplay = useRef(true);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.setLayoutProperty("cells-2d", "visibility", display === "flat" ? "visible" : "none");
    m.setLayoutProperty("cells-3d", "visibility", display === "towers" ? "visible" : "none");
    if (firstDisplay.current) { firstDisplay.current = false; return; }
    m.easeTo({ pitch: display === "towers" ? 58 : 0, bearing: display === "towers" ? -18 : 0, duration: 1400 });
  }, [display, ready]);

  // ---------- data ----------
  useEffect(() => {
    api.timeseries(region, "2002-07", "2026-11").then((t) => setSeries(t.series)).catch(() => {});
  }, [region]);

  useEffect(() => {
    if (mode !== "month") return;
    api.cells(picked.y, picked.m, res, region.country ? { country: region.country } : {})
      .then((r) => { setCells(r.cells); setCellNote(r.note); }).catch(() => setCells([]));
    api.compare(region, picked.y, picked.m).then(setCmp).catch(() => setCmp(null));
  }, [region, picked, res, mode]);

  useEffect(() => {
    if (mode !== "years" || yd) return;
    const qs = region.country ? `country=${encodeURIComponent(region.country)}` : `bbox=${region.bbox}`;
    fetch(`${API}/cells/years?${qs}&res=0.5`).then((r) => r.json()).then(setYd).catch(() => {});
  }, [mode, yd, region]);

  // ④ individual fires in the visible window, once zoomed in
  const loadFires = useCallback(() => {
    const m = map.current;
    if (!m) return;
    if (mode !== "month" || m.getZoom() < DOTS_ZOOM) { (m.getSource("fires") as any)?.setData(EMPTY); setFires(null); return; }
    const b = m.getBounds();
    const cx = (b.getWest() + b.getEast()) / 2, cy = (b.getSouth() + b.getNorth()) / 2;
    const hw = Math.min((b.getEast() - b.getWest()) / 2, 4), hh = Math.min((b.getNorth() - b.getSouth()) / 2, 3.5);
    const box = [cx - hw, cy - hh, cx + hw, cy + hh].map((v) => v.toFixed(3)).join(",");
    fetch(`${API}/fires?year=${picked.y}&month=${picked.m}&bbox=${box}`)
      .then((r) => r.json()).then((d) => {
        if (!d.columns) { setFires(null); return; }
        const ci = Object.fromEntries((d.columns as string[]).map((c, i) => [c, i]));
        const features = (d.fires as number[][]).map((f) => ({
          type: "Feature", geometry: { type: "Point", coordinates: [f[ci.lon], f[ci.lat]] },
          properties: { lat: f[ci.lat], lon: f[ci.lon], frp: f[ci.frp], a: f[ci.a], s: f[ci.s], n: f[ci.n], w: f[ci.w], wf: f[ci.wf] },
        }));
        (m.getSource("fires") as any)?.setData({ type: "FeatureCollection", features });
        setFires({ n: d.n, truncated: d.n >= 6000 });
      }).catch(() => setFires(null));
  }, [mode, picked]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    let t: any;
    const onMove = () => { clearTimeout(t); t = setTimeout(loadFires, 350); };
    m.on("moveend", onMove);
    loadFires();
    return () => { m.off("moveend", onMove); clearTimeout(t); };
  }, [ready, loadFires]);

  // draw month cells (fixed colour scale = FireCensus max, so a single satellite looks as sparse as it really is)
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || mode !== "month") return;
    const max = Math.max(1, ...cells.map((c) => c.n_hat));
    const h = res / 2;
    const features = cells.map((c: any) => {
      const v = lensValue(c, lens);
      if (v <= 0 && !anomaly) return null;
      return {
        type: "Feature",
        properties: {
          v: Math.round(v), fc: Math.round(c.n_hat), med: Math.round(c.n_median),
          c: anomaly ? rdbu((v + 1) / (c.n_median + 1)) : viridis(Math.log1p(v) / Math.log1p(max)),
          h: Math.sqrt(v / max) * 260000 * (res / 0.25),
        },
        geometry: { type: "Polygon", coordinates: square(c.lon, c.lat, h) },
      };
    }).filter(Boolean);
    (m.getSource("cells") as any)?.setData({ type: "FeatureCollection", features });
    m.setPaintProperty("cells-2d", "fill-opacity", zoom >= DOTS_ZOOM ? 0.35 : 0.85);
  }, [cells, anomaly, res, ready, lens, mode, zoom]);

  // draw the timelapse year
  const yMax = useMemo(() => (yd ? Math.max(1, ...yd.n_hat.flat()) : 1), [yd]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || mode !== "years" || !yd) return;
    const vals = yd[ylens][yi], fc = yd.n_hat[yi], h = yd.res / 2;
    const features = yd.cells.map(([lat, lon], j) => vals[j] > 0 ? {
      type: "Feature",
      properties: { v: vals[j], fc: fc[j], med: 0, c: viridis(Math.log1p(vals[j]) / Math.log1p(yMax)), h: Math.sqrt(vals[j] / yMax) * 420000 },
      geometry: { type: "Polygon", coordinates: square(lon, lat, h) },
    } : null).filter(Boolean);
    (m.getSource("cells") as any)?.setData({ type: "FeatureCollection", features });
    (m.getSource("fires") as any)?.setData(EMPTY);
    m.setPaintProperty("cells-2d", "fill-opacity", 0.85);
  }, [yd, yi, ylens, mode, ready, yMax]);

  // the timelapse is about the whole region: fly back out to it
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || mode !== "years") return;
    const [w, s, e, n] = bounds;
    m.fitBounds([[w, s], [e, n]], { padding: { top: 360, bottom: 130, left: 60, right: 60 }, duration: 1200, maxZoom: 7 });
  }, [mode, ready, bounds]);

  // play: one year every 0.9 s, slower around the 2012 step
  useEffect(() => {
    if (!playing || !yd) return;
    if (yi >= yd.years.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setYi((i) => i + 1), yd.years[yi] === 2011 || yd.years[yi] === 2012 ? 1900 : 900);
    return () => clearTimeout(t);
  }, [playing, yi, yd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dock) setDock(null); else if (mode === "years") { setMode("month"); setPlaying(false); } else onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dock, mode, onBack]);

  // ---------- derived numbers ----------
  const idx = useMemo(() => {
    const m = new Map<string, SeriesRow>();
    series.forEach((r) => m.set(`${r.year}-${r.month}`, r));
    return m;
  }, [series]);
  const row = idx.get(`${picked.y}-${picked.m}`);
  const grid: Grid | null = useMemo(() => {
    if (!series.length) return null;
    const years = Array.from(new Set(series.map((r) => r.year))).sort();
    const med = new Map<number, number>();
    for (let k = 1; k <= 12; k++) med.set(k, median(series.filter((r) => r.month === k && r.year >= 2003 && r.year <= 2025).map((r) => r.n_hat)));
    const v = (y: number, k: number) => idx.get(`${y}-${k}`)?.n_hat ?? 0;
    return { years, value: v, fc: v, raw: (y, k) => idx.get(`${y}-${k}`)?.aqua_raw ?? 0, ratio: (y, k) => (v(y, k) + 1) / ((med.get(k) ?? 0) + 1) };
  }, [series, idx]);
  const yTotals = useMemo(() => yd ? {
    fc: yd.n_hat.map((r) => r.reduce((a, b) => a + b, 0)),
    naive: yd.naive.map((r) => r.reduce((a, b) => a + b, 0)),
  } : null, [yd]);
  const hv = hoverYm ? idx.get(`${hoverYm.y}-${hoverYm.m}`) : undefined;
  const ym = `${picked.y}-${String(picked.m).padStart(2, "0")}`;
  const years = Array.from({ length: 25 }, (_, i) => 2002 + i);
  const lensTotal = rowValue(row, lens), fcTotal = row?.n_hat ?? 0;
  const lensLabel = LENSES.find((l) => l.id === lens)!.label;

  return (
    <div className="fixed inset-0 top-12 z-30 animate-[fadeIn_0.7s_ease-out]">
      <div ref={el} className="absolute inset-0" />

      {/* top-left: back + region */}
      <div className="pointer-events-none absolute left-4 top-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-space/80 py-1.5 pl-1.5 pr-5 backdrop-blur">
          <button className="btn rounded-full py-1 text-sm" onClick={onBack} title="Back to the globe (Esc)">← Globe</button>
          <div>
            <div className="text-lg font-semibold leading-tight">{labelForArea(area)}</div>
            <div className="text-[11px] text-slate-400">{mode === "years" ? "Every year, 2002–2026" : `${MONTHS[picked.m - 1]} ${picked.y}`}</div>
          </div>
        </div>
      </div>

      {/* ① top-centre: satellite lens */}
      {mode === "month" && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-[290px]">
          <div className="card pointer-events-auto bg-space/85 px-4 py-3 text-center">
            <div className="label mb-2 text-sat">Whose eyes? Pick a satellite</div>
            <div className="flex gap-1">
              {LENSES.map((l) => {
                const off = !flying(l.id, picked.y, picked.m);
                const on = lens === l.id;
                return (
                  <button key={l.id} disabled={off} onClick={() => setLens(l.id)} title={off ? "Not in orbit this month" : l.sub}
                    className={`rounded-lg px-3 py-1.5 text-left text-sm leading-tight transition ${on ? (l.id === "fc" ? "bg-fire text-black" : "bg-sat text-black") : "text-slate-300 hover:bg-white/5"} ${off ? "cursor-not-allowed opacity-30" : ""}`}>
                    <div className="font-semibold">{l.label}</div>
                    <div className={`text-[10px] ${on ? "text-black/70" : "text-slate-500"}`}>{off ? "not in orbit" : l.sub}</div>
                  </button>
                );
              })}
            </div>
            {row && (
              <div className="mt-2">
                <span className={`num text-2xl font-semibold ${lens === "fc" ? "text-fire" : "text-sat"}`}>{fmt(lensTotal)}</span>
                <span className="ml-2 text-sm text-slate-300">
                  {lens === "fc" ? "fires, including the ones no satellite saw" : lens === "seen" ? "fires seen by at least one satellite" : `fire detections by ${lensLabel} alone`}
                </span>
                <div className="mt-0.5 text-xs text-slate-400">
                  {lens === "fc"
                    ? row.n_obs > 0 ? <>No satellite saw <b className="text-white">{fmt(fcTotal - row.n_obs)}</b> of them ({Math.round((100 * (fcTotal - row.n_obs)) / Math.max(fcTotal, 1))}%). Switch satellites to compare.</> : null
                    : lensTotal > 0 ? <>That is <b className="text-white">1 in {Math.max(1, Math.round(fcTotal / lensTotal))}</b> of the {fmt(fcTotal)} fires FireCensus counts. Same colours, so the gaps are real.</> : <>Nothing recorded this month.</>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ③ top-centre: timelapse */}
      {mode === "years" && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-[260px]">
          <div className="card pointer-events-auto w-[min(760px,100%)] bg-space/90 px-5 py-4">
            {!yd || !yTotals ? <div className="py-6 text-center text-slate-400">Loading 25 years of fires…</div> : (
              <>
                <div className="flex items-center gap-4">
                  <button className="btn h-11 w-11 rounded-full p-0 text-lg" onClick={() => { if (yi >= yd.years.length - 1) setYi(0); setPlaying((p) => !p); }} aria-label={playing ? "Pause" : "Play"}>
                    {playing ? "❚❚" : "▶"}
                  </button>
                  <div className="num w-[88px] text-4xl font-semibold">{yd.years[yi]}</div>
                  <Counter label="Newest satellite (raw)" value={yTotals.naive[yi]} color="#4FC3F7" active={ylens === "naive"} onClick={() => setYlens("naive")}
                    sub={yd.years[yi] < 2012 ? "Aqua MODIS" : "S-NPP VIIRS"} />
                  <Counter label="FireCensus" value={yTotals.fc[yi]} color="#FF6B35" active={ylens === "n_hat"} onClick={() => setYlens("n_hat")} sub="harmonized" />
                  <button className="btn ml-auto self-start px-2 py-1 text-xs" onClick={() => { setMode("month"); setPlaying(false); }} title="Back to one month (Esc)">✕</button>
                </div>
                <Spark years={yd.years} a={yTotals.naive} b={yTotals.fc} i={yi} onPick={(k) => { setPlaying(false); setYi(k); }} />
                <div className="mt-1 min-h-[34px] text-sm">
                  {yd.years[yi] === 2012 ? (
                    <p className="text-white">🛰 <b>2012: VIIRS joins.</b> The raw count jumps <b className="text-sat">×{(yTotals.naive[yi] / Math.max(yTotals.naive[yi - 1], 1)).toFixed(1)}</b> overnight, with no real change in fires. FireCensus moves <b className="text-fire">{(((yTotals.fc[yi] / Math.max(yTotals.fc[yi - 1], 1)) - 1) * 100).toFixed(0)}%</b>.</p>
                  ) : yd.years[yi] === 2026 ? (
                    <p className="text-slate-300">2026 so far (Jan–mid Nov). S-NPP stopped on 2 Nov; FireCensus carries on with the other satellites.</p>
                  ) : yd.years[yi] < 2012 ? (
                    <p className="text-slate-400">Before 2012 only MODIS flew. FireCensus back-casts what VIIRS would have counted, so the whole record is on one scale.</p>
                  ) : (
                    <p className="text-slate-400">The peaks are real drought years (2015, 2019, 2023). The 2011 → 2012 step in the blue line is not.</p>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs">
                  <span className="mr-1 text-slate-500">Map shows:</span>
                  {YLENSES.map((l) => <button key={l.id} className={`btn px-2 py-0.5 text-xs ${ylens === l.id ? "btn-on" : ""}`} onClick={() => setYlens(l.id)}>{l.label}</button>)}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* hover readouts */}
      {hoverFire && mode === "month" && (
        <div className="card pointer-events-none absolute right-16 top-4 w-72 p-3 text-sm">
          <div className="mb-1 font-semibold">One detected fire · {hoverFire.frp} MW</div>
          <div className="flex gap-2 text-xs">
            {([["Aqua", hoverFire.a], ["S-NPP", hoverFire.s], ["NOAA-20", hoverFire.n]] as const).map(([k, v]) => (
              <span key={k} className={`rounded px-1.5 py-0.5 ${v === 1 ? "bg-fire/25 text-fire" : v === 0 ? "bg-white/10 text-slate-400 line-through" : "bg-white/5 text-slate-600"}`}>{k} {v === 1 ? "✓" : v === 0 ? "missed" : "–"}</span>
            ))}
          </div>
          <p className="mt-2 text-[13px] leading-snug text-slate-300">
            {picked.y < 2012
              ? <>Seen by Aqua alone (before VIIRS). It stands for <b className="text-white">{hoverFire.w}</b> VIIRS-equivalent fires.</>
              : <>A fire like this has a <b className="text-white">{Math.round(100 / Math.max(hoverFire.wf, 1))}%</b> chance of being caught by at least one satellite, so it counts as <b className="text-fire">{hoverFire.w}</b> fires: itself plus {Math.max(0, hoverFire.w - 1).toFixed(1)} that slipped past every satellite.</>}
          </p>
        </div>
      )}
      {hoverCell && !hoverFire && (
        <div className="card pointer-events-none absolute right-16 top-4 p-3 text-sm">
          <div className="num text-lg font-semibold">{fmt(hoverCell.v)} {mode === "month" && lens !== "fc" ? "detections" : "fires"}</div>
          <div className="text-xs text-slate-400">
            in this {mode === "years" ? yd?.res : res}° cell{(mode === "years" ? ylens !== "n_hat" : lens !== "fc") ? <> · FireCensus: {fmt(hoverCell.fc)}</> : null}
            {mode === "month" && lens === "fc" ? <> · typical {MONTHS[picked.m - 1]}: {fmt(hoverCell.med)}</> : null}
          </div>
        </div>
      )}
      {mode === "month" && (
        <div className="pointer-events-none absolute bottom-[132px] left-4 rounded-full border border-line bg-space/80 px-3 py-1 text-xs text-slate-300 backdrop-blur">
          {zoom < DOTS_ZOOM ? "🔍 Zoom in to see every single fire" : fires ? `${fmt(fires.n)} individual fires${fires.truncated ? " (largest shown)" : ""} · hover one` : "Loading fires…"}
          <span className="ml-2 text-slate-500">· cells {res}°</span>
        </div>
      )}

      {/* docked year x month panel */}
      {dock && mode === "month" && (
        <div className="card absolute bottom-[150px] right-4 top-[190px] flex w-[min(560px,46vw)] flex-col overflow-hidden">
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
        <div className="card mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 bg-space/85 px-4 py-3 backdrop-blur">
          {mode === "month" ? (
            <>
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
            </>
          ) : <span className="text-sm text-slate-300">Timelapse · one map per year · same colour scale for both counts</span>}

          <div className="flex gap-1 rounded-xl border border-line p-1">
            <button className={`rounded-lg px-3 py-1.5 text-sm ${display === "flat" ? "bg-fire text-black" : "text-slate-300 hover:bg-white/5"}`} onClick={() => setDisplay("flat")}>Map</button>
            <button className={`rounded-lg px-3 py-1.5 text-sm ${display === "towers" ? "bg-fire text-black" : "text-slate-300 hover:bg-white/5"}`} onClick={() => setDisplay("towers")}>3D towers</button>
            {mode === "month" && <button className={`rounded-lg px-3 py-1.5 text-sm ${dock ? "bg-sat text-black" : "text-slate-300 hover:bg-white/5"}`} onClick={() => setDock(dock ? null : "calendar")}>Calendar & skyline</button>}
          </div>
          <button className={`btn ${mode === "years" ? "btn-on" : "border-fire/60 text-white"}`} onClick={() => {
            if (mode === "years") { setMode("month"); setPlaying(false); } else { setMode("years"); setDock(null); setYi(0); setPlaying(true); }
          }}>
            {mode === "years" ? "Back to one month" : "▶ Play 2002–2026"}
          </button>
          {mode === "month" && (
            <label className="flex items-center gap-1.5 text-xs text-slate-300">
              <input type="checkbox" checked={anomaly} onChange={(e) => setAnomaly(e.target.checked)} /> Compare with a normal year
            </label>
          )}
          <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
            <span>{anomaly && mode === "month" ? "¼× normal" : "few"}</span>
            <span className="h-2.5 w-24 rounded" style={{ background: `linear-gradient(90deg, ${(anomaly && mode === "month" ? RDBU_STOPS : VIRIDIS_STOPS).join(",")})` }} />
            <span>{anomaly && mode === "month" ? "4× normal" : "many fires"}</span>
            {mode === "month" && <a className="ml-2 text-sat underline" href={api.csvCells(region.country ? { country: region.country } : region, ym, ym)}>⬇ CSV</a>}
          </div>
          {mode === "month" && cellNote && <p className="w-full text-[11px] text-slate-500">{cellNote}</p>}
        </div>
      </div>
    </div>
  );
}

function Counter({ label, sub, value, color, active, onClick }: { label: string; sub: string; value: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-xl border px-3 py-1.5 text-left transition ${active ? "border-white/40 bg-white/5" : "border-transparent hover:bg-white/5"}`} title="Show this count on the map">
      <div className="text-[11px] text-slate-400"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: color }} />{label}</div>
      <div className="num text-2xl font-semibold" style={{ color }}>{fmt(value)}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </button>
  );
}

/** Two yearly lines on one axis (raw newest satellite vs FireCensus), current year marked; click to jump. */
function Spark({ years, a, b, i, onPick }: { years: number[]; a: number[]; b: number[]; i: number; onPick: (k: number) => void }) {
  // each line relative to its own 2012–2025 average, so both sit on one scale and a fake step stands out
  const k12 = years.indexOf(2012), k25 = years.indexOf(2025);
  const norm = (v: number[]) => { const ref = v.slice(k12, k25 + 1).reduce((s, d) => s + d, 0) / (k25 - k12 + 1) || 1; return v.map((d) => d / ref); };
  a = norm(a); b = norm(b);
  const W = 700, H = 70, max = Math.max(...a, ...b, 1);
  const x = (k: number) => 16 + (k * (W - 32)) / (years.length - 1);
  const y = (v: number) => H - 6 - (v / max) * (H - 14);
  const path = (v: number[]) => v.map((d, k) => `${k ? "L" : "M"}${x(k)},${y(d)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="mt-2 w-full cursor-pointer" onClick={(e) => {
      const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      onPick(Math.max(0, Math.min(years.length - 1, Math.round((((e.clientX - r.left) / r.width) * W - 16) / (W - 32) * (years.length - 1)))));
    }}>
      <line x1={x(k12)} x2={x(k12)} y1={2} y2={H} stroke="#64748b" strokeDasharray="3 3" />
      <text x={x(k12) + 4} y={10} fontSize={9} fill="#94a3b8">VIIRS joins</text>
      <text x={W - 16} y={10} fontSize={9} fill="#64748b" textAnchor="end">each line vs its own 2012–2025 average</text>
      <path d={path(a)} fill="none" stroke="#4FC3F7" strokeWidth={2} />
      <path d={path(b)} fill="none" stroke="#FF6B35" strokeWidth={2.2} />
      <line x1={x(i)} x2={x(i)} y1={2} y2={H} stroke="#fff" strokeOpacity={0.5} />
      <circle cx={x(i)} cy={y(a[i])} r={3.5} fill="#4FC3F7" />
      <circle cx={x(i)} cy={y(b[i])} r={3.5} fill="#FF6B35" />
      {[2002, 2006, 2010, 2014, 2018, 2022, 2026].map((yy) => (
        <text key={yy} x={x(years.indexOf(yy))} y={H + 10} fontSize={9} fill="#64748b" textAnchor="middle">{yy}</text>
      ))}
    </svg>
  );
}
