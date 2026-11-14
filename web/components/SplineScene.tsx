"use client";
// Spline globe (states: Welcome, Focus_*, Story_Scan, Story_Zoom, Story_Handoff, Story_Fleet, Story_Example_*, Explore_*), driven by the `scene` variable.
// Adapted from FireCensusScene.jsx (Spline build). Debug number keys only with ?debug=1.
import Spline from "@splinetool/react-spline";
import { useEffect, useRef } from "react";

export const SCENE_URL = "https://prod.spline.design/i6gXDIRfGjWXMnZA/scene.splinecode";
const STATES = ["Welcome", "Focus_Terra", "Focus_Aqua", "Focus_SNPP", "Focus_NOAA20", "Focus_NOAA21", "Story_Scan", "Story_Zoom", "Story_Handoff", "Story_Fleet", "Story_Example_Month", "Story_Example_Season", "Story_Example_Trend"];

export default function SplineScene({ state, onLoaded, onStateChange }: {
  state: string; onLoaded?: () => void; onStateChange?: (s: string) => void;
}) {
  const app = useRef<any>(null);
  const poll = useRef<any>(null);
  const drag = useRef({ on: false, x: 0, y: 0, yaw: 0, pitch: 0 });

  useEffect(() => { app.current?.setVariable("scene", state); }, [state]);
  useEffect(() => () => clearInterval(poll.current), []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("debug") !== "1") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const i = "123456789".indexOf(e.key);
      if (i >= 0) { app.current?.setVariable("scene", STATES[i]); onStateChange?.(STATES[i]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStateChange]);

  function onLoad(spline: any) {
    app.current = spline;
    spline.setVariable("scene", state);
    let last = state;
    poll.current = setInterval(() => {
      const v = spline.getVariable("scene");
      if (v !== last) { last = v; onStateChange?.(v); }
    }, 150);
    onLoaded?.();
  }

  const down = (e: React.PointerEvent) => { drag.current.on = true; drag.current.x = e.clientX; drag.current.y = e.clientY; };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.on || !app.current) return;
    d.yaw += (e.clientX - d.x) * 0.3;
    d.pitch = Math.max(-35, Math.min(35, d.pitch + (e.clientY - d.y) * 0.2));
    d.x = e.clientX; d.y = e.clientY;
    app.current.setVariable("dragYaw", d.yaw);
    app.current.setVariable("dragPitch", d.pitch);
  };
  const up = () => { drag.current.on = false; };

  return (
    <div className="h-full w-full" style={{ touchAction: "pan-y" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
      <Spline scene={SCENE_URL} onLoad={onLoad} />
    </div>
  );
}
