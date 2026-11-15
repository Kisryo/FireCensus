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
    ghosts: { type: "geojson", data: EMPTY },
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
    // fires no satellite saw (FireCensus lens only): hollow violet rings placed around the detection they were inferred from
    { id: "ghost-ring", type: "circle", source: "ghosts", minzoom: DOTS_ZOOM,
      paint: { "circle-color": "rgba(167,139,250,0.22)", "circle-stroke-color": "#A78BFA", "circle-stroke-width": 1.4, "circle-stroke-opacity": 0.95,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6.5, 2.2, 10, 5.5] } },
    // detected fires: colour depends on the satellite lens (seen by it / missed by it)
    { id: "fire-core", type: "circle", source: "fires", minzoom: DOTS_ZOOM,
      paint: { "circle-color": ["get", "c"], "circle-opacity": ["get", "o"], "circle-stroke-color": ["get", "sc"], "circle-stroke-width": 0.8,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6.5, ["*", 1.6, ["get", "r"]], 10, ["*", 4, ["get", "r"]]] } },
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

function peakMonthOf(series: SeriesRow[]) {
  if (!series.length) return 9;
  const med = Array.from({ length: 12 }, (_, k) => median(series.filter((r) => r.month === k + 1 && r.year >= 2003 && r.year <= 2025).map((r) => r.n_hat)));
  return med.indexOf(Math.max(...med)) + 1;
}

export default function RegionExplorer({ area, initYm, onBack }: { area: string; initYm: { y: number; m: number }; onBack: () => void }) {
  const [custom, setCustom] = useState<string | null>(null); // a box the visitor drew
  const region = useMemo(() => (custom ? { bbox: custom } : regionForArea(area)), [area, custom]);
  const areaBounds = useMemo(() => boundsForArea(area), [area]);
  const bounds = useMemo(() => (custom ? (custom.split(",").map(Number) as [number, number, number, number]) : areaBounds), [custom, areaBounds]);
  const [drawing, setDrawing] = useState(false);
  const drawRef = useRef(false);
  const drawStart = useRef<maplibregl.LngLat | null>(null);
  const [tour, setTour] = useState<number | null>(null); // story tour step
  const [cap, setCap] = useState<any>(null);
  const [curves, setCurves] = useState<any>(null);
  const [dataOpen, setDataOpen] = useState(false);
  const [from, setFrom] = useState("2002-07");
  const [to, setTo] = useState("2026-11");
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
  const [hoverGhost, setHoverGhost] = useState<Fire | null>(null);
  const firesRef = useRef<Fire[]>([]);
  const [firesVer, setFiresVer] = useState(0);
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
    const [w, s, e, n] = areaBounds;
    const m = new maplibregl.Map({
      container: el.current, style: STYLE, center: [(w + e) / 2, (s + n) / 2], zoom: 1.6,
      attributionControl: { compact: true }, maxPitch: 70,
    });
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
    m.on("mousemove", "ghost-ring", (ev: any) => { const p = ev.features?.[0]?.properties; if (p) setHoverGhost(p as Fire); });
    m.on("mouseleave", "ghost-ring", () => setHoverGhost(null));
    // ✎ Draw area: drag a box
    const boxGeo = (a: maplibregl.LngLat, b: maplibregl.LngLat) => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: {},
      geometry: { type: "Polygon", coordinates: [[[a.lng, a.lat], [b.lng, a.lat], [b.lng, b.lat], [a.lng, b.lat], [a.lng, a.lat]]] } }] });
    m.on("mousedown", (ev) => { if (!drawRef.current) return; ev.preventDefault(); drawStart.current = ev.lngLat; m.dragPan.disable(); });
    m.on("mousemove", (ev) => { if (drawRef.current && drawStart.current) (m.getSource("area") as any)?.setData(boxGeo(drawStart.current, ev.lngLat)); });
    m.on("mouseup", (ev) => {
      if (!drawRef.current || !drawStart.current) return;
      const a = drawStart.current, b = ev.lngLat;
      drawStart.current = null; drawRef.current = false; setDrawing(false); m.dragPan.enable(); m.getCanvas().style.cursor = "";
      if (Math.abs(a.lng - b.lng) < 0.3 || Math.abs(a.lat - b.lat) < 0.3) return;
      setCustom([Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)].map((v) => v.toFixed(2)).join(","));
    });
    map.current = m;
    return () => m.remove();
  }, [areaBounds]);

  useEffect(() => {
    drawRef.current = drawing;
    if (map.current) map.current.getCanvas().style.cursor = drawing ? "crosshair" : "";
  }, [drawing]);

  // a new box (or reset): outline it, fly to it, forget data for the old area
  const firstBounds = useRef(true);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const [w, s, e, n] = bounds;
    (m.getSource("area") as any)?.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {},
      geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }] });
    if (firstBounds.current) { firstBounds.current = false; return; }
    setYd(null); setCap(null); setSeries([]);
    m.fitBounds([[w, s], [e, n]], { padding: { top: 190, bottom: 130, left: 60, right: 60 }, duration: 1400, maxZoom: 9 });
  }, [bounds, ready]);

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
    if (mode !== "month" || m.getZoom() < DOTS_ZOOM) { firesRef.current = []; setFiresVer((v) => v + 1); setFires(null); return; }
    const b = m.getBounds();
    const cx = (b.getWest() + b.getEast()) / 2, cy = (b.getSouth() + b.getNorth()) / 2;
    const hw = Math.min((b.getEast() - b.getWest()) / 2, 4), hh = Math.min((b.getNorth() - b.getSouth()) / 2, 3.5);
    const box = [cx - hw, cy - hh, cx + hw, cy + hh].map((v) => v.toFixed(3)).join(",");
    fetch(`${API}/fires?year=${picked.y}&month=${picked.m}&bbox=${box}`)
      .then((r) => r.json()).then((d) => {
        if (!d.columns) { setFires(null); return; }
        const ci = Object.fromEntries((d.columns as string[]).map((c, i) => [c, i]));
        firesRef.current = (d.fires as number[][]).map((f) => ({ lat: f[ci.lat], lon: f[ci.lon], frp: f[ci.frp], a: f[ci.a], s: f[ci.s], n: f[ci.n], w: f[ci.w], wf: f[ci.wf] }));
        setFiresVer((v) => v + 1);
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

  // draw individual fires for the current lens
  const fireStats = useMemo(() => {
    const list = mode === "month" ? firesRef.current : [];
    const key = lens === "aqua" ? "a" : lens === "snpp" ? "s" : lens === "noaa20" ? "n" : null;
    const feats: any[] = [], ghosts: any[] = [];
    let seen = 0, missed = 0, est = 0;
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (const f of list) {
      const hit = key ? (f as any)[key] === 1 : true;
      if (hit) seen++; else missed++;
      feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [f.lon, f.lat] },
        properties: { ...f, hit: hit ? 1 : 0,
          c: !key ? "#FFE3C2" : hit ? "#4FC3F7" : "#475569", sc: !key ? "#FF6B35" : hit ? "#E0F2FE" : "#334155",
          o: hit ? 1 : 0.55, r: hit ? 1 : 0.7 } });
      if (lens === "fc") {
        // the extra (w - 1) fires this detection stands for, scattered within ~2 km of it (exact spots are unknown)
        const extra = f.w - 1;
        const k = Math.floor(extra) + (rnd() < extra - Math.floor(extra) ? 1 : 0);
        for (let i = 0; i < k && ghosts.length < 25000; i++) {
          const ang = rnd() * 2 * Math.PI, rad = 0.006 + rnd() * 0.014;
          ghosts.push({ type: "Feature", geometry: { type: "Point", coordinates: [f.lon + rad * Math.cos(ang), f.lat + rad * Math.sin(ang)] }, properties: { ...f } });
        }
        est += k;
      }
    }
    return { seen, missed, est, key, feats, ghosts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firesVer, lens, mode]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("fires") as any)?.setData({ type: "FeatureCollection", features: fireStats.feats });
    (m.getSource("ghosts") as any)?.setData({ type: "FeatureCollection", features: fireStats.ghosts });
  }, [fireStats, ready]);

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
      properties: { v: vals[j], fc: fc[j], med: 0, c: viridis(Math.sqrt(vals[j] / yMax)), h: Math.sqrt(vals[j] / yMax) * 420000 },
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

  // ---------- story tour ----------
  const tourYm = useMemo(() => ({ y: 2026, m: Math.min(peakMonthOf(series), 10) }), [series]);
  useEffect(() => {
    if (tour === null) return;
    if (!curves) api.curves().then(setCurves).catch(() => {});
    if (!cap) fetch(`${API}/capture?year=${tourYm.y}&month=${tourYm.m}&${region.country ? `country=${encodeURIComponent(region.country)}` : `bbox=${region.bbox}`}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Capture data request failed (${r.status})`);
        const data = await r.json();
        if (Array.isArray(data?.patterns)) setCap(data);
      }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, cap, region, tourYm]);
  const flewHot = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (tour === null || !m || !ready) return;
    setDock(null);
    const fit = () => { const [w, s, e, n] = bounds; m.fitBounds([[w, s], [e, n]], { padding: { top: 340, bottom: 120, left: 60, right: 60 }, duration: 1500, maxZoom: 7 }); };
    if (tour <= 3) { setMode("month"); setPlaying(false); setPicked(tourYm); setDisplay("flat"); }
    if (tour === 0) { setLens("seen"); fit(); }
    if (tour === 1) { setLens("aqua"); fit(); }
    if (tour === 2) { setLens("aqua"); flewHot.current = false; }
    if (tour === 3) setLens("fc");
    if (tour === 4) { setMode("years"); setYlens("aqua"); setPlaying(false); setYi(4); }
    if (tour === 5) { setMode("years"); setYlens("naive"); setPlaying(false); setYi(9); const t = setTimeout(() => setYi(10), 1800); return () => clearTimeout(t); }
    if (tour === 6) { setMode("years"); setYlens("n_hat"); setYi(0); setPlaying(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, ready]);
  // step 3: zoom into the hottest cell of the region so single fires show
  useEffect(() => {
    const m = map.current;
    if (tour !== 2 || !m || flewHot.current || !cells.length || picked.m !== tourYm.m || picked.y !== tourYm.y) return;
    const [w, s, e, n] = bounds;
    const inside = cells.filter((c) => c.lon >= w && c.lon <= e && c.lat >= s && c.lat <= n);
    const hot = (inside.length ? inside : cells).reduce((a, b) => (b.n_hat > a.n_hat ? b : a));
    flewHot.current = true;
    m.flyTo({ center: [hot.lon, hot.lat - 0.25], zoom: 8.2, duration: 2600, essential: true });
  }, [tour, cells, picked, tourYm, bounds]);
  const stopTour = () => { setTour(null); setPlaying(false); setMode("month"); setLens("fc"); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (tour !== null) stopTour(); else if (drawing) setDrawing(false); else if (dock) setDock(null); else if (mode === "years") { setMode("month"); setPlaying(false); } else onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dock, mode, onBack, tour, drawing]);

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
    aqua: yd.aqua.map((r) => r.reduce((a, b) => a + b, 0)),
  } : null, [yd]);
  // fire season and worst years (2003–2025 full years)
  const peak = useMemo(() => {
    if (!series.length) return null;
    const med = Array.from({ length: 12 }, (_, k) => median(series.filter((r) => r.month === k + 1 && r.year >= 2003 && r.year <= 2025).map((r) => r.n_hat)));
    const top = med.indexOf(Math.max(...med));
    let a = top, b = top;
    while (med[(a + 11) % 12] >= 0.5 * med[top] && (a + 11) % 12 !== top) a = (a + 11) % 12;
    while (med[(b + 1) % 12] >= 0.5 * med[top] && (b + 1) % 12 !== top) b = (b + 1) % 12;
    const tot = new Map<number, number>();
    series.filter((r) => r.year >= 2003 && r.year <= 2025).forEach((r) => tot.set(r.year, (tot.get(r.year) ?? 0) + r.n_hat));
    const worst = [...tot.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([y]) => y);
    return { month: top + 1, first: a + 1, last: b + 1, worst };
  }, [series]);
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
        <div className="pointer-events-auto flex max-w-[310px] items-center gap-3 rounded-3xl border border-line bg-space/80 py-1.5 pl-1.5 pr-4 backdrop-blur">
          <button className="btn shrink-0 whitespace-nowrap rounded-full py-1 text-sm" onClick={onBack} title="Back to the globe (Esc)">← Globe</button>
          <div>
            <div className="text-lg font-semibold leading-tight">{custom ? "Your area" : labelForArea(area)}</div>
            <div className="text-[11px] text-slate-400">{mode === "years" ? "Every year, 2002–2026" : `${MONTHS[picked.m - 1]} ${picked.y}`}</div>
            {peak && (
              <div className="text-[11px] text-slate-300">
                Fire season <b className="text-fire">{MONTHS[peak.first - 1]}–{MONTHS[peak.last - 1]}</b> · peak {MONTHS[peak.month - 1]} · worst years <b className="text-white">{peak.worst.join(", ")}</b>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* top-right: draw your own area */}
      {tour === null && (
        <div className="absolute right-4 top-4 flex flex-col items-end gap-1.5">
          <button className={`btn bg-space/85 backdrop-blur ${drawing ? "btn-on" : ""}`} onClick={() => setDrawing((d) => !d)}>
            {drawing ? "Drag a box on the map…" : "✎ Draw area"}
          </button>
          {custom && <button className="btn bg-space/85 py-1 text-xs backdrop-blur" onClick={() => setCustom(null)}>↺ Back to {labelForArea(area)}</button>}
        </div>
      )}

      {/* story tour */}
      {tour !== null && (
        <TourPanel step={tour} setStep={setTour} onClose={stopTour} region={custom ? "your area" : labelForArea(area)} ym={tourYm}
          row={idx.get(`${tourYm.y}-${tourYm.m}`)} cap={cap} curves={curves} yd={yd} yTotals={yTotals} yi={yi} setYi={setYi}
          playing={playing} setPlaying={setPlaying} worst={peak?.worst ?? []} />
      )}

      {/* ① top-centre: satellite lens */}
      {mode === "month" && tour === null && (
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
      {mode === "years" && tour === null && (
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
        <div className="card pointer-events-none absolute right-4 top-[120px] w-72 p-3 text-sm">
          <div className="mb-1 font-semibold">
            {fireStats.key && !(hoverFire as any)[fireStats.key] ? <span className="text-slate-400">Missed by {lensLabel} · </span> : fireStats.key ? <span className="text-sat">Seen by {lensLabel} · </span> : null}
            One detected fire · {hoverFire.frp} MW
          </div>
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
      {hoverGhost && !hoverFire && mode === "month" && (
        <div className="card pointer-events-none absolute right-4 top-[120px] w-72 p-3 text-sm">
          <div className="mb-1 font-semibold text-[#A78BFA]">○ A fire no satellite saw (estimated)</div>
          <p className="text-[13px] leading-snug text-slate-300">
            {picked.y < 2012
              ? <>Before 2012 only Aqua flew. A detection nearby stands for <b className="text-white">{hoverGhost.w}</b> VIIRS-equivalent fires, so FireCensus adds the missing ones here.</>
              : <>A {hoverGhost.frp} MW fire nearby had only a <b className="text-white">{Math.round(100 / Math.max(hoverGhost.wf, 1))}%</b> chance of being caught. For every fire like it that a satellite saw, about <b className="text-white">{Math.max(0, hoverGhost.w - 1).toFixed(1)}</b> similar fires burned unseen.</>}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Drawn within ~2 km of that detection; the exact spot is unknown. The count is what FireCensus estimates.</p>
        </div>
      )}
      {hoverCell && !hoverFire && !hoverGhost && (
        <div className="card pointer-events-none absolute right-4 top-[120px] p-3 text-sm">
          <div className="num text-lg font-semibold">{fmt(hoverCell.v)} {mode === "month" && lens !== "fc" ? "detections" : "fires"}</div>
          <div className="text-xs text-slate-400">
            in this {mode === "years" ? yd?.res : res}° cell{(mode === "years" ? ylens !== "n_hat" : lens !== "fc") ? <> · FireCensus: {fmt(hoverCell.fc)}</> : null}
            {mode === "month" && lens === "fc" ? <> · typical {MONTHS[picked.m - 1]}: {fmt(hoverCell.med)}</> : null}
          </div>
        </div>
      )}
      {mode === "month" && (
        <div className="pointer-events-none absolute bottom-[132px] left-4 rounded-full border border-line bg-space/80 px-3 py-1 text-xs text-slate-300 backdrop-blur">
          {zoom < DOTS_ZOOM ? "🔍 Zoom in to see every single fire" : !fires ? "Loading fires…" : lens === "fc" ? (
            <><span className="text-[#FFE3C2]">●</span> {fmt(fireStats.seen)} seen by a satellite · <span className="text-[#A78BFA]">○</span> {fmt(fireStats.est)} no satellite saw{fires.truncated ? " (largest shown)" : ""} · hover one</>
          ) : fireStats.key ? (
            <><span className="text-sat">●</span> {fmt(fireStats.seen)} seen by {lensLabel} · <span className="text-slate-500">●</span> {fmt(fireStats.missed)} missed by {lensLabel} (another satellite saw them)</>
          ) : (
            <><span className="text-[#FFE3C2]">●</span> {fmt(fireStats.seen)} fires seen by at least one satellite · switch to FireCensus to add the unseen ones</>
          )}
          <span className="ml-2 text-slate-500">· cells {res}°{cellNote ? " · before 2012: back-cast from Aqua, cells are noisy" : ""}</span>
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

      {/* bottom control bar: one row, legend on the right */}
      <div className="absolute inset-x-4 bottom-9">
        <div className="card relative flex items-center gap-x-2.5 whitespace-nowrap bg-space/85 px-4 py-2.5 backdrop-blur">
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
          ) : <span className="text-sm text-slate-300">One map per year · same colour scale for every count</span>}

          <div className="flex gap-1 rounded-xl border border-line p-1">
            <button className={`rounded-lg px-3 py-1 text-sm ${display === "flat" ? "bg-fire text-black" : "text-slate-300 hover:bg-white/5"}`} onClick={() => setDisplay("flat")}>Map</button>
            <button className={`rounded-lg px-3 py-1 text-sm ${display === "towers" ? "bg-fire text-black" : "text-slate-300 hover:bg-white/5"}`} onClick={() => setDisplay("towers")}>3D towers</button>
            {mode === "month" && <button className={`rounded-lg px-3 py-1 text-sm ${dock ? "bg-sat text-black" : "text-slate-300 hover:bg-white/5"}`} onClick={() => setDock(dock ? null : "calendar")}>Calendar & skyline</button>}
          </div>
          <button className={`btn ${tour !== null ? "btn-on" : "border-fire/60 text-white"}`} onClick={() => (tour !== null ? stopTour() : setTour(0))}>
            {tour !== null ? "✕ End story" : "▶ Play the story"}
          </button>
          <button className={`btn ${dataOpen ? "btn-on" : ""}`} onClick={() => setDataOpen((o) => !o)}>⬇ Data</button>
          {mode === "month" && (
            <label className="flex items-center gap-1.5 text-xs text-slate-300">
              <input type="checkbox" checked={anomaly} onChange={(e) => setAnomaly(e.target.checked)} /> vs a normal year
            </label>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-slate-400">
            <span>{anomaly && mode === "month" ? "¼× normal" : "few"}</span>
            <span className="h-2.5 w-20 rounded" style={{ background: `linear-gradient(90deg, ${(anomaly && mode === "month" ? RDBU_STOPS : VIRIDIS_STOPS).join(",")})` }} />
            <span>{anomaly && mode === "month" ? "4× normal" : "many fires"}</span>
          </div>

          {dataOpen && (
            <div className="card absolute bottom-full left-1/2 mb-2 w-[420px] -translate-x-1/2 whitespace-normal bg-space/95 p-4">
              <div className="label mb-2">Download · {custom ? "your area" : labelForArea(area)}</div>
              <div className="grid grid-cols-[48px_1fr] items-center gap-2 text-sm">
                <span className="text-slate-400">From</span>
                <input type="month" min="2002-07" max="2026-11" value={from} onChange={(e) => setFrom(e.target.value)} className="num" />
                <span className="text-slate-400">To</span>
                <input type="month" min="2002-07" max="2026-11" value={to} onChange={(e) => setTo(e.target.value)} className="num" />
              </div>
              <div className="mt-3 flex flex-col gap-1.5 text-sm">
                <a className="btn" href={api.csvTimeseries(region, from, to)}>⬇ Monthly fire counts (CSV): FireCensus + each satellite</a>
                <a className="btn" href={api.csvCells(region.country ? { country: region.country } : region, from, to)}>⬇ Map cells, 0.1° × month (CSV)</a>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Data: NASA FIRMS (MODIS C6.1, VIIRS 375 m). We acknowledge LANCE FIRMS, operated by NASA ESDIS.</p>
            </div>
          )}
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
function Spark({ years, a, b, i, onPick, abs }: { years: number[]; a: number[]; b: number[]; i: number; onPick: (k: number) => void; abs?: boolean }) {
  // default: each line relative to its own 2012–2025 average, so both sit on one scale and a fake step stands out
  const k12 = years.indexOf(2012), k25 = years.indexOf(2025);
  const norm = (v: number[]) => { const ref = v.slice(k12, k25 + 1).reduce((s, d) => s + d, 0) / (k25 - k12 + 1) || 1; return v.map((d) => d / ref); };
  if (!abs) { a = norm(a); b = norm(b); }
  const W = 520, H = 80, max = Math.max(...a, ...b, 1);
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
      <text x={W - 16} y={10} fontSize={9} fill="#64748b" textAnchor="end">{abs ? "fires per year" : "each line vs its own 2012–2025 average"}</text>
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

// ---------------- story tour ----------------
const STEPS = [
  "Every satellite sees a different slice",
  "Borrowed from ecology: mark & recapture",
  "Small fires hide",
  "Adding back the fires nobody saw",
  "Before 2012: rebuilding the past",
  "The test: 2012",
  "What's left is real",
];

function TourPanel({ step, setStep, onClose, region, ym, row, cap, curves, yd, yTotals, yi, setYi, playing, setPlaying, worst }: {
  step: number; setStep: (n: number) => void; onClose: () => void; region: string; ym: { y: number; m: number };
  row?: SeriesRow; cap: any; curves: any; yd: YearsData | null; yTotals: { fc: number[]; naive: number[]; aqua: number[] } | null;
  yi: number; setYi: (n: number) => void; playing: boolean; setPlaying: (b: boolean | ((p: boolean) => boolean)) => void; worst: number[];
}) {
  const when = `${MONTHS[ym.m - 1]} ${ym.y}`;
  const lp = cap?.lincoln_petersen;
  const patterns = useMemo(() => {
    if (!Array.isArray(cap?.patterns)) return [];
    const g = new Map<string, number>();
    for (const r of cap.patterns as any[]) {
      const k = [r.a === 1 && "Aqua", r.s === 1 && "S-NPP", r.n === 1 && "NOAA-20"].filter(Boolean).join(" + ");
      if (k) g.set(k, (g.get(k) ?? 0) + r.fires);
    }
    return [...g.entries()].sort((a, b) => b[1] - a[1]);
  }, [cap]);
  const allThree = patterns.find(([k]) => k === "Aqua + S-NPP + NOAA-20")?.[1] ?? 0;
  const year = yd?.years[yi];
  const jump = yTotals ? yTotals.naive[10] / Math.max(yTotals.naive[9], 1) : 0;
  const chg = yTotals ? (yTotals.fc[10] / Math.max(yTotals.fc[9], 1) - 1) * 100 : 0;

  let text: React.ReactNode = null, graph: React.ReactNode = null;
  if (step === 0) {
    text = <>In {when}, satellites saw <b className="text-white">{fmt(cap?.n_obs ?? row?.n_obs)}</b> fires over {region}. But each satellite saw a different set: only <b className="text-white">{fmt(allThree)}</b> were caught by all three. What a satellite catches depends on when it passes, the clouds, and above all how big the fire is.</>;
    graph = patterns.length ? <PatternBars rows={patterns.slice(0, 7)} /> : <Loading />;
  } else if (step === 1) {
    text = <>Ecologists count fish by catching some, marking them, then catching again: the share of marked fish in the second catch tells you how big the whole lake is. Here Aqua makes the first catch and S-NPP the second. The map shows Aqua&apos;s catch.</>;
    graph = lp ? (
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat k="Aqua caught (n₁)" v={lp.n1_aqua} c="#94a3b8" /><Stat k="S-NPP caught (n₂)" v={lp.n2_snpp} c="#4FC3F7" /><Stat k="caught by both (m)" v={lp.m_both} c="#fff" />
        </div>
        <div className="rounded-lg bg-white/5 p-2 text-center"><span className="font-mono">N ≈ n₁ × n₂ ÷ m</span> = <b className="num text-lg text-white">{fmt(lp.n)}</b> fires</div>
        <p className="text-xs text-slate-400">Both satellites together saw {fmt(lp.seen_by_either)} of these fires; the 1950s formula says about <b className="text-white">{fmt(lp.n)}</b> burned. FireCensus, on the same fires: <b className="text-fire">{fmt(lp.firecensus_same_fires)}</b>. Same ballpark from a completely independent method. But Lincoln–Petersen assumes every fire is equally easy to catch, and fires are not.</p>
      </div>
    ) : <Loading />;
  } else if (step === 2) {
    text = <>A satellite&apos;s chance of seeing a fire rises with its heat (FRP) and falls with pixel size. We fit this for each satellite with a <b className="text-white">Huggins capture–recapture model</b>: <span className="font-mono text-[12px]">logit p = α + β₁·log FRP + β₂·log area</span>. Aqua&apos;s 1 km pixels need about 25 MW to see a fire half the time. On the map: <span className="text-sat">blue</span> = Aqua saw it, <span className="text-slate-400">grey</span> = Aqua missed it but VIIRS caught it. Most of the grey ones are small.</>;
    graph = curves ? <CurveChart c={curves} /> : <Loading />;
  } else if (step === 3) {
    const seen = row?.n_obs ?? 0, tot = row?.n_hat ?? 0;
    text = <>Each detected fire counts as <span className="font-mono">1 / p*</span>, where p* is the chance that at least one satellite catches a fire like it (<b className="text-white">Horvitz–Thompson</b>). A fire with a 25% chance counts as 4: itself plus 3 that nobody saw. <span className="text-[#A78BFA]">Violet rings</span> are those unseen fires, drawn around the detection they come from.</>;
    graph = tot ? (
      <div className="space-y-2 text-sm">
        <div className="font-mono text-center text-[13px]">N̂ = Σ 1 / p*ᵢ ,  p*ᵢ = 1 − Π (1 − pᵢₛ)</div>
        <div className="flex h-8 overflow-hidden rounded-lg">
          <div className="flex items-center justify-center bg-[#FFE3C2] text-xs font-semibold text-black" style={{ width: `${(100 * seen) / tot}%` }}>seen {fmt(seen)}</div>
          <div className="flex items-center justify-center bg-[#A78BFA]/70 text-xs font-semibold text-black" style={{ width: `${100 - (100 * seen) / tot}%` }}>unseen {fmt(tot - seen)}</div>
        </div>
        <p className="text-xs text-slate-400">{when}, {region}: <b className="text-fire">{fmt(tot)}</b> fires in total, {Math.round((100 * (tot - seen)) / tot)}% of them invisible to every satellite.</p>
      </div>
    ) : <Loading />;
  } else if (step === 4) {
    text = <>From 2002 to 2011 only MODIS (Aqua) flew. In the overlap years we learned how many VIIRS-equivalent fires each Aqua fire stands for, by season and region, and used it to rebuild the earlier years on the same scale. The map shows what Aqua alone saw{year ? ` in ${year}` : ""}; the orange line is the rebuilt record.</>;
    graph = yd && yTotals ? (
      <div>
        <div className="flex gap-4 text-xs"><span><span className="text-[#4FC3F7]">━</span> Aqua alone (raw)</span><span><span className="text-fire">━</span> FireCensus (rebuilt)</span></div>
        <Spark abs years={yd.years} a={yTotals.aqua} b={yTotals.fc} i={yi} onPick={(k) => { setPlaying(false); setYi(k); }} />
      </div>
    ) : <Loading />;
  } else if (step === 5) {
    text = <>2012: VIIRS joins. If you always use the newest satellite, the fire count jumps <b className="text-sat">×{jump.toFixed(1)}</b> overnight. The fires did not change, the eyes did. FireCensus moves <b className="text-fire">{chg > 0 ? "+" : ""}{chg.toFixed(0)}%</b>. Watch the map switch from 2011 to 2012.</>;
    graph = yd && yTotals ? (
      <div>
        <div className="flex gap-4 text-xs"><span><span className="text-[#4FC3F7]">━</span> Newest satellite (raw)</span><span><span className="text-fire">━</span> FireCensus</span></div>
        <Spark years={yd.years} a={yTotals.naive} b={yTotals.fc} i={yi} onPick={(k) => { setPlaying(false); setYi(k); }} />
      </div>
    ) : <Loading />;
  } else {
    text = <>With the satellite effect removed, what is left is real. The worst years here are <b className="text-white">{worst.join(", ")}</b>; across Southeast Asia the big fire years follow El Niño droughts (2006, 2015, 2019, 2023). This is 25 years of fires on one scale, whichever satellites were flying. Press ▶ to watch them all.</>;
    graph = yd && yTotals ? (
      <div>
        <div className="flex items-center gap-3">
          <button className="btn h-9 w-9 rounded-full p-0" onClick={() => { if (yi >= yd.years.length - 1) setYi(0); setPlaying((p) => !p); }}>{playing ? "❚❚" : "▶"}</button>
          <span className="num text-3xl font-semibold">{year}</span>
          <span className="num text-xl font-semibold text-fire">{fmt(yTotals.fc[yi])}</span><span className="text-xs text-slate-400">fires (FireCensus)</span>
        </div>
        <Spark years={yd.years} a={yTotals.naive} b={yTotals.fc} i={yi} onPick={(k) => { setPlaying(false); setYi(k); }} />
      </div>
    ) : <Loading />;
  }

  return (
    <div className="pointer-events-none absolute left-[340px] right-4 top-4 flex justify-center">
      <div className="card pointer-events-auto w-full max-w-[1000px] bg-space/92 p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="label text-fire">The story · {step + 1}/{STEPS.length}</span>
          <div className="flex gap-1">{STEPS.map((_, k) => <button key={k} onClick={() => setStep(k)} className={`h-1.5 w-6 rounded-full ${k === step ? "bg-fire" : k < step ? "bg-fire/40" : "bg-white/15"}`} aria-label={`Step ${k + 1}`} />)}</div>
          <button className="btn ml-auto px-2 py-0.5 text-xs" onClick={onClose} title="End the story (Esc)">✕</button>
        </div>
        <div className="grid grid-cols-[1fr_1fr] gap-5">
          <div>
            <h3 className="text-xl font-semibold leading-snug">{STEPS[step]}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-300">{text}</p>
          </div>
          <div className="self-center">{graph}</div>
        </div>
        <div className="mt-3 flex justify-between">
          <button className="btn py-1 text-sm" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
          {step < STEPS.length - 1
            ? <button className="btn btn-on py-1 text-sm" onClick={() => setStep(step + 1)}>Next →</button>
            : <button className="btn btn-on py-1 text-sm" onClick={onClose}>Explore on your own →</button>}
        </div>
      </div>
    </div>
  );
}

const Loading = () => <div className="py-6 text-center text-sm text-slate-500">Loading…</div>;
const Stat = ({ k, v, c }: { k: string; v: number; c: string }) => (
  <div className="rounded-lg bg-white/5 p-2"><div className="num text-lg font-semibold" style={{ color: c }}>{fmt(v)}</div><div className="text-[10px] text-slate-400">{k}</div></div>
);

/** Fires by capture history: which combination of satellites saw them. */
function PatternBars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <div className="space-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-xs">
          <span className="w-[150px] shrink-0 text-right text-slate-300">{k}</span>
          <div className="h-4 flex-1 rounded bg-white/5"><div className="h-4 rounded" style={{ width: `${(100 * v) / max}%`, background: k.includes("+") ? "#FF6B35" : "#4FC3F7", opacity: k.split("+").length === 3 ? 1 : 0.75 }} /></div>
          <span className="num w-14 text-slate-400">{fmt(v)}</span>
        </div>
      ))}
      <p className="pt-1 text-[10px] text-slate-500">Fires seen by each combination of satellites. Blue = only one satellite saw it.</p>
    </div>
  );
}

/** Detection probability vs fire heat for each satellite (fitted Huggins curves, at nadir pixel size). */
function CurveChart({ c }: { c: any }) {
  const W = 440, H = 150, L = 34, B = 24;
  const xs: number[] = c.frp_mw;
  const lx = (v: number) => L + ((Math.log10(v) - Math.log10(xs[0])) / (Math.log10(xs[xs.length - 1]) - Math.log10(xs[0]))) * (W - L - 8);
  const ly = (p: number) => H - B - p * (H - B - 8);
  const line = (ps: number[]) => ps.map((p, i) => `${i ? "L" : "M"}${lx(xs[i])},${ly(p)}`).join("");
  const series: [string, string, boolean][] = [["Aqua", "#94a3b8", false], ["SNPP", "#4FC3F7", false], ["NOAA20", "#22d3ee", true]];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 0.5, 1].map((p) => <g key={p}><line x1={L} x2={W - 8} y1={ly(p)} y2={ly(p)} stroke="#1e293b" strokeDasharray={p === 0.5 ? "3 3" : ""} /><text x={L - 4} y={ly(p) + 3} fontSize={9} fill="#64748b" textAnchor="end">{p * 100}%</text></g>)}
      {[1, 10, 100].map((v) => <text key={v} x={lx(v)} y={H - 8} fontSize={9} fill="#64748b" textAnchor="middle">{v} MW</text>)}
      {series.map(([k, col, dash]) => c.p_detect[k] && <path key={k} d={line(c.p_detect[k])} fill="none" stroke={col} strokeWidth={2.2} strokeDasharray={dash ? "4 3" : ""} />)}
      <text x={lx(0.55)} y={ly(0.62)} fontSize={10} fill="#4FC3F7">VIIRS (S-NPP, NOAA-20) · 375 m</text>
      <text x={W - 10} y={ly(0.22)} fontSize={10} fill="#94a3b8" textAnchor="end">MODIS (Aqua) · 1 km</text>
      <text x={L} y={10} fontSize={9} fill="#64748b">chance of being detected</text>
    </svg>
  );
}
