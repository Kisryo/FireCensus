"use client";
// Fire skyline: years x months 3D bar grid (page-flow.md sections 3.4, 9, 10).
// Height and colour encode the same value; the Top preset is the accessible 2D calendar view.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { MONTHS, viridis, rdbu } from "@/lib/colors";

export type Preset = "iso" | "front" | "side" | "top";

export type Grid = {
  years: number[];
  value: (y: number, m: number) => number; // current source value
  fc: (y: number, m: number) => number; // FireCensus value (fixed scale + recovered overlay)
  raw: (y: number, m: number) => number; // raw MODIS (Aqua) value
  ratio: (y: number, m: number) => number; // value / same-month median
};

const SP = 1.15; // spacing
const HMAX = 7; // tallest bar

function presetPos(p: Preset, nYears: number): [THREE.Vector3, THREE.Vector3] {
  const cx = (11 * SP) / 2;
  const cz = ((nYears - 1) * SP) / 2;
  const t = new THREE.Vector3(cx, 1.5, cz);
  const d = Math.max(nYears * SP, 14);
  switch (p) {
    case "front":
      return [new THREE.Vector3(cx, 4.5, cz + d * 0.75), new THREE.Vector3(cx, 2.5, cz)];
    case "side":
      return [new THREE.Vector3(-d * 0.95, 4.5, cz), new THREE.Vector3(cx, 2.5, cz)];
    case "top":
      return [new THREE.Vector3(cx, d * 1.55, cz + 0.01), new THREE.Vector3(cx, 0, cz)];
    default:
      return [new THREE.Vector3(cx - d * 0.6, d * 0.8, cz + d * 1.1), t];
  }
}

function CameraRig({ preset, nYears, controls }: { preset: Preset; nYears: number; controls: any }) {
  const { camera } = useThree();
  const goal = useRef(presetPos(preset, nYears));
  const moving = useRef(true);
  useEffect(() => {
    goal.current = presetPos(preset, nYears);
    moving.current = true;
  }, [preset, nYears]);
  useFrame((_, dt) => {
    if (!moving.current || !controls.current) return;
    const [pos, tgt] = goal.current;
    const k = 1 - Math.pow(0.002, dt);
    camera.position.lerp(pos, k);
    controls.current.target.lerp(tgt, k);
    controls.current.update();
    if (camera.position.distanceTo(pos) < 0.05) moving.current = false;
  });
  return null;
}

function Bars({ grid, log, anomaly, recovered, fixedScale, onHover, onPick }: {
  grid: Grid; log: boolean; anomaly: boolean; recovered: boolean; fixedScale: boolean;
  onHover: (h: { y: number; m: number } | null) => void; onPick: (h: { y: number; m: number }) => void;
}) {
  const n = grid.years.length * 12;
  const bars = useRef<THREE.InstancedMesh>(null!);
  const over = useRef<THREE.InstancedMesh>(null!);
  const cur = useRef(new Float32Array(n));
  const curOver = useRef(new Float32Array(n * 2));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  const maxFc = useMemo(() => {
    let m = 1;
    grid.years.forEach((y) => { for (let k = 1; k <= 12; k++) m = Math.max(m, fixedScale ? grid.fc(y, k) : 0, grid.value(y, k)); });
    return m;
  }, [grid, fixedScale]);
  const h = (v: number) => (log ? (Math.log1p(v) / Math.log1p(maxFc)) * HMAX : (v / maxFc) * HMAX);

  const targets = useMemo(() => {
    const t = new Float32Array(n);
    const o = new Float32Array(n * 2);
    grid.years.forEach((y, yi) => {
      for (let m = 1; m <= 12; m++) {
        const i = yi * 12 + (m - 1);
        t[i] = h(grid.value(y, m));
        o[i * 2] = h(grid.raw(y, m));
        o[i * 2 + 1] = h(grid.fc(y, m));
      }
    });
    return { t, o };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, log, maxFc]);

  // colours
  useEffect(() => {
    grid.years.forEach((y, yi) => {
      for (let m = 1; m <= 12; m++) {
        const i = yi * 12 + (m - 1);
        const v = grid.value(y, m);
        const c = anomaly ? rdbu(grid.ratio(y, m)) : viridis(log ? Math.log1p(v) / Math.log1p(maxFc) : Math.sqrt(v / maxFc));
        bars.current.setColorAt(i, col.set(v <= 0 ? "#1b2236" : c));
      }
    });
    if (bars.current.instanceColor) bars.current.instanceColor.needsUpdate = true;
  }, [grid, anomaly, log, maxFc, col]);

  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.02, dt); // ~1.5 s to settle
    grid.years.forEach((_, yi) => {
      for (let m = 0; m < 12; m++) {
        const i = yi * 12 + m;
        cur.current[i] += (targets.t[i] - cur.current[i]) * k;
        const hh = Math.max(cur.current[i], 0.02);
        dummy.position.set(m * SP, hh / 2, yi * SP);
        dummy.scale.set(0.9, hh, 0.9);
        dummy.updateMatrix();
        bars.current.setMatrixAt(i, dummy.matrix);
        // recovered-fire overlay: from raw MODIS height up to FireCensus height
        const lo = (curOver.current[i * 2] += (targets.o[i * 2] - curOver.current[i * 2]) * k);
        const hi = (curOver.current[i * 2 + 1] += (targets.o[i * 2 + 1] - curOver.current[i * 2 + 1]) * k);
        const span = recovered ? Math.max(hi - lo - 0.02, 0) : 0; // stop just below the bar top (no z-fighting)
        dummy.position.set(m * SP, lo + span / 2, yi * SP);
        dummy.scale.set(span > 0.01 ? 0.96 : 0.0001, Math.max(span, 0.0001), span > 0.01 ? 0.96 : 0.0001);
        dummy.updateMatrix();
        over.current.setMatrixAt(i, dummy.matrix);
      }
    });
    bars.current.instanceMatrix.needsUpdate = true;
    over.current.instanceMatrix.needsUpdate = true;
  });

  const pick = (e: any) => {
    const i = e.instanceId;
    if (i === undefined) return null;
    return { y: grid.years[Math.floor(i / 12)], m: (i % 12) + 1 };
  };

  return (
    <>
      <instancedMesh
        ref={bars}
        args={[undefined, undefined, n]}
        onPointerMove={(e) => { e.stopPropagation(); onHover(pick(e)); }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); const p = pick(e); if (p) onPick(p); }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.55} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={over} args={[undefined, undefined, n]} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#FF6B35" transparent opacity={0.5} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
      </instancedMesh>
    </>
  );
}

function Labels({ years }: { years: number[] }) {
  return (
    <>
      {MONTHS.map((m, i) => (
        <Html key={m} position={[i * SP, 0, years.length * SP + 0.6]} center className="pointer-events-none">
          <span className="text-[10px] text-slate-400">{m}</span>
        </Html>
      ))}
      {years.map((y, i) =>
        y % 2 === 0 || years.length < 14 ? (
          <Html key={y} position={[-1.4, 0, i * SP]} center className="pointer-events-none">
            <span className="num text-[10px] text-slate-400">{y}</span>
          </Html>
        ) : null
      )}
    </>
  );
}

export default function Skyline3D(props: {
  grid: Grid; preset: Preset; log: boolean; anomaly: boolean; recovered: boolean; fixedScale: boolean;
  onHover: (h: { y: number; m: number } | null) => void; onPick: (h: { y: number; m: number }) => void;
}) {
  const controls = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [p0] = useState(() => presetPos(props.preset, props.grid.years.length));
  return (
    <Canvas
      camera={{ position: p0[0].toArray() as any, fov: 40, near: 0.1, far: 500 }}
      onCreated={() => setReady(true)}
      dpr={[1, 1.75]}
    >
      <color attach="background" args={["#0B0F1A"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[-10, 25, 15]} intensity={1.4} />
      <directionalLight position={[20, 10, -10]} intensity={0.35} color="#4FC3F7" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(11 * SP) / 2, -0.01, ((props.grid.years.length - 1) * SP) / 2]}>
        <planeGeometry args={[12 * SP + 2, props.grid.years.length * SP + 2]} />
        <meshStandardMaterial color="#0f1626" />
      </mesh>
      <Bars {...props} />
      <Labels years={props.grid.years} />
      <OrbitControls ref={controls} enableDamping makeDefault maxPolarAngle={Math.PI / 2.05} />
      {ready && <CameraRig preset={props.preset} nYears={props.grid.years.length} controls={controls} />}
    </Canvas>
  );
}
