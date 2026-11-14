"use client";
// 2D map: shows harmonized fire counts per cell for one month; "Draw area" lets the user drag a box.
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";

// MapLibre's web worker is served from /public (bundlers can't resolve it automatically).
try { (maplibregl as any).setWorkerUrl?.("/maplibre/maplibre-gl-worker.mjs"); } catch {}
import type { Cell } from "@/lib/api";
import { viridis, rdbu } from "@/lib/colors";

// Self-contained basemap (no external tiles): Natural Earth 1:50m country outlines (public domain),
// clipped to Southeast Asia, served from /public.
const STYLE: any = {
  version: 8,
  sources: { countries: { type: "geojson", data: "/sea-countries.geojson" } },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0B0F1A" } },
    { id: "land", type: "fill", source: "countries", paint: { "fill-color": "#152038" } },
    { id: "borders", type: "line", source: "countries", paint: { "line-color": "#33466e", "line-width": 0.7 } },
  ],
};

function boxFeature(b?: string) {
  if (!b) return { type: "FeatureCollection", features: [] } as any;
  const [x0, y0, x1, y1] = b.split(",").map(Number);
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] } }],
  } as any;
}

export default function RegionMap({ cells, res, anomaly, bbox, onBbox }: {
  cells: Cell[]; res: number; anomaly: boolean; bbox?: string; onBbox: (b: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [drawing, setDrawing] = useState(false);
  const drawRef = useRef(false);
  const start = useRef<maplibregl.LngLat | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: STYLE, center: [108, 6], zoom: 3.3, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("cells", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "cells", type: "fill", source: "cells", paint: { "fill-color": ["get", "c"], "fill-opacity": 0.85 } });
      m.addSource("box", { type: "geojson", data: boxFeature() });
      m.addLayer({ id: "box-fill", type: "fill", source: "box", paint: { "fill-color": "#4FC3F7", "fill-opacity": 0.08 } });
      m.addLayer({ id: "box-line", type: "line", source: "box", paint: { "line-color": "#4FC3F7", "line-width": 2 } });
      setLoaded(true);
    });
    m.on("mousedown", (e) => {
      if (!drawRef.current) return;
      e.preventDefault();
      start.current = e.lngLat;
      m.dragPan.disable();
    });
    m.on("mousemove", (e) => {
      if (!drawRef.current || !start.current) return;
      const a = start.current, b = e.lngLat;
      const s = [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)].map((v) => v.toFixed(2)).join(",");
      (m.getSource("box") as any)?.setData(boxFeature(s));
    });
    m.on("mouseup", (e) => {
      if (!drawRef.current || !start.current) return;
      const a = start.current, b = e.lngLat;
      start.current = null;
      m.dragPan.enable();
      drawRef.current = false;
      setDrawing(false);
      if (Math.abs(a.lng - b.lng) < 0.2 || Math.abs(a.lat - b.lat) < 0.2) return;
      onBbox([Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)].map((v) => v.toFixed(2)).join(","));
    });
    map.current = m;
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded || !map.current) return;
    const max = Math.max(1, ...cells.map((c) => c.n_hat));
    const h = res / 2;
    const features = cells.filter((c) => c.n_hat > 0 || anomaly).map((c) => ({
      type: "Feature",
      properties: { c: anomaly ? rdbu((c.n_hat + 1) / (c.n_median + 1)) : viridis(Math.log1p(c.n_hat) / Math.log1p(max)) },
      geometry: { type: "Polygon", coordinates: [[[c.lon - h, c.lat - h], [c.lon + h, c.lat - h], [c.lon + h, c.lat + h], [c.lon - h, c.lat + h], [c.lon - h, c.lat - h]]] },
    }));
    (map.current.getSource("cells") as any)?.setData({ type: "FeatureCollection", features });
  }, [cells, res, anomaly, loaded]);

  useEffect(() => {
    if (!loaded || !map.current) return;
    (map.current.getSource("box") as any)?.setData(boxFeature(bbox));
  }, [bbox, loaded]);

  useEffect(() => {
    drawRef.current = drawing;
    if (map.current) map.current.getCanvas().style.cursor = drawing ? "crosshair" : "";
  }, [drawing]);

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      <button className={`btn absolute left-3 top-3 bg-space/80 ${drawing ? "btn-on" : ""}`} onClick={() => setDrawing((d) => !d)}>
        {drawing ? "Drag on the map…" : "✎ Draw area"}
      </button>
    </div>
  );
}
