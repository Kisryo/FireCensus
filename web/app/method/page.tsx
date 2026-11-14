"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const COLORS: Record<string, string> = { Aqua: "#FFB74D", SNPP: "#4FC3F7", NOAA20: "#64B5F6", NOAA21: "#B39DDB" };

function Curves() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.curves().then(setD).catch(() => setD(null)); }, []);
  if (!d) return <div className="text-sm text-slate-500">Loading detection curves… (needs the API running)</div>;
  const W = 640, H = 300, L = 48, B = 36;
  const xs = d.frp_mw as number[];
  const x = (v: number) => L + ((Math.log10(v) - Math.log10(xs[0])) / (Math.log10(xs[xs.length - 1]) - Math.log10(xs[0]))) * (W - L - 10);
  const y = (p: number) => H - B - p * (H - B - 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl" role="img" aria-label="Detection probability versus fire radiative power for each sensor">
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <g key={p}>
          <line x1={L} x2={W - 10} y1={y(p)} y2={y(p)} stroke="#1F2A44" />
          <text x={L - 6} y={y(p) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">{p * 100}%</text>
        </g>
      ))}
      {[1, 10, 100].map((v) => (
        <text key={v} x={x(v)} y={H - B + 16} textAnchor="middle" fontSize={11} fill="#94a3b8">{v} MW</text>
      ))}
      <text x={(W + L) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="#94a3b8">Fire radiative power (log scale): each sensor at its nadir pixel (MODIS 1 km, VIIRS 375 m)</text>
      {Object.entries(d.p_detect).map(([sat, ps]: any) => (
        <g key={sat}>
          <path d={ps.map((p: number, i: number) => `${i ? "L" : "M"}${x(xs[i])},${y(p)}`).join("")} fill="none" stroke={COLORS[sat]} strokeWidth={2.5} />
          <text x={x(xs[Math.floor(xs.length * 0.62)]) + 4} y={y(ps[Math.floor(xs.length * 0.62)]) - 6} fontSize={12} fill={COLORS[sat]}>{sat === "SNPP" ? "S-NPP" : sat === "NOAA20" ? "NOAA-20" : sat}</text>
        </g>
      ))}
    </svg>
  );
}

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-14 text-2xl font-semibold">{children}</h2>;
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-3 max-w-3xl leading-relaxed text-slate-300">{children}</p>;

export default function MethodPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-24">
      <div className="label text-fire">Method</div>
      <h1 className="mt-1 text-3xl font-semibold">Counting the fires every satellite missed</h1>
      <P>
        MODIS and VIIRS see the same fires with different eyes, so their raw counts can't be compared. Instead of converting one
        sensor into the other with a single ratio, FireCensus treats every satellite pass as a <b>wildlife survey</b>. It uses
        capture-recapture statistics from ecology to estimate the true number of fires burning during each afternoon window,
        including the fires no satellite detected.
      </P>

      <H>1 · Capture histories</H>
      <P>Detections from Aqua MODIS, S-NPP VIIRS and NOAA-20 VIIRS in the same afternoon window (12:30–15:30 local solar time) are clustered within 1.5 km. Each cluster is one fire, with a history of who saw it:</P>
      <div className="mt-4 overflow-x-auto">
        <table className="text-sm">
          <thead className="text-left text-slate-400"><tr><th className="pr-6">History (Aqua, S-NPP, NOAA-20)</th><th>Meaning</th></tr></thead>
          <tbody className="num">
            <tr><td className="pr-6 py-1">(1,1,1)</td><td className="font-sans">Big fire: everyone saw it</td></tr>
            <tr><td className="pr-6 py-1">(0,1,1)</td><td className="font-sans">Small fire: only the 375 m sensors saw it</td></tr>
            <tr><td className="pr-6 py-1">(1,0,1)</td><td className="font-sans">Missed by one pass (cloud, scan angle, timing)</td></tr>
            <tr><td className="pr-6 py-1">(–,1,1)</td><td className="font-sans">Aqua didn't fly over: <i>missing</i>, not a miss</td></tr>
            <tr><td className="pr-6 py-1 text-fire">(0,0,0)</td><td className="font-sans">Never seen. Estimated, not observed.</td></tr>
          </tbody>
        </table>
      </div>

      <H>2 · Each sensor's detection curve</H>
      <P>A Huggins conditional-likelihood model gives each sensor its own probability of detecting a fire, as a function of the fire's radiative power (FRP) and the pixel size at that scan angle. MODIS needs a much bigger fire before it notices.</P>
      <div className="mt-4"><Curves /></div>
      <P>Each observed fire is weighted by 1 / P(seen by at least one sensor) (Horvitz–Thompson). Weights are capped at 20.</P>

      <H>3 · Back to 2002</H>
      <P>Before 2012 only MODIS flew. FireCensus learns from 2012–2021 how many fires MODIS misses, per region and month, and restores them for 2002–2011. It uses only information MODIS itself provides, so the same rule applies before and after 2012.</P>

      <H>4 · Validation</H>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400"><tr><th className="py-1 pr-4">Test</th><th className="pr-4">Result</th></tr></thead>
          <tbody className="align-top">
            <tr className="border-t border-line"><td className="py-2 pr-4">Leave-one-year-out back-cast (2012–2021, 240 region-months)</td><td>Median error 12.5% (naive ratio method 14.0%); 5.6% vs 7.5% in peak months</td></tr>
            <tr className="border-t border-line"><td className="py-2 pr-4">Drop one sensor (2023–2025, 4-sensor model)</td><td>Raw counts change 15–25%; FireCensus N changes 0–6%</td></tr>
            <tr className="border-t border-line"><td className="py-2 pr-4">2011 → 2012 sensor switch (Indonesia)</td><td>Naive count jumps 4.4×; FireCensus 363 k → 349 k</td></tr>
            <tr className="border-t border-line"><td className="py-2 pr-4">Burning calendar vs raw VIIRS (model-free)</td><td>Same peak months: Thailand Mar–Feb–Apr, Indonesia Sep–Oct–Aug</td></tr>
            <tr className="border-t border-line"><td className="py-2 pr-4">Australia control (Black Summer 2019–20)</td><td>Hot, large fires: small correction (1.06–1.27×) vs Borneo peat (1.24–1.64×). The method does not just inflate everything.</td></tr>
            <tr className="border-t border-line"><td className="py-2 pr-4">Clustering distance 1.5 → 3 km</td><td>Conclusions unchanged</td></tr>
            <tr className="border-t border-line"><td className="py-2 pr-4">NOAA-21 as a 4th sensor</td><td>FRP for 50% detection: S-NPP 14.8, NOAA-20 15.1, NOAA-21 13.1 MW. The VIIRS units are interchangeable.</td></tr>
          </tbody>
        </table>
      </div>

      <H>5 · Limitations</H>
      <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-slate-300">
        <li>Capture-recapture assumes the fire population is stable within the 3-hour window. We measured how recapture rates fall with the time gap between passes, and define the estimand as <i>fires burning during the window</i>.</li>
        <li>Unmodeled differences between fires make N a conservative estimate. Models calibrated on different periods differ by about 20%. All years use one calibration (2012–2021), so comparisons over time are fair.</li>
        <li>2002–2011 single cells are noisy (each Aqua fire stands for ~13). Use regional totals or 0.5° cells.</li>
        <li>Aug–Nov 2026 are near-real-time data, which have no fire-type field. Static heat sources are masked using science-quality flags. S-NPP ended on 2 Nov 2026; after that only Aqua and NOAA-20 count.</li>
        <li>N counts fire events, not burned area or emissions. 2015 peat fires emitted more smoke than their count suggests.</li>
      </ul>

      <H>6 · Data & citations</H>
      <ul className="mt-3 max-w-3xl space-y-1 text-sm text-slate-300">
        <li>We acknowledge the use of data from LANCE FIRMS, operated by NASA&apos;s Earth Science Data and Information System (ESDIS). <a className="text-sat underline" href="https://www.earthdata.nasa.gov/data/tools/firms">earthdata.nasa.gov/data/tools/firms</a></li>
        <li>Giglio, Schroeder & Justice (2016), MODIS C6 active fire algorithm. doi:10.1016/j.rse.2016.02.054</li>
        <li>Schroeder et al. (2014), VIIRS 375 m active fire product. doi:10.1016/j.rse.2013.12.008</li>
        <li>Davies et al. (2009), FIRMS. doi:10.1109/TGRS.2008.2002076</li>
        <li>Justice et al. (2002), MODIS fire products. doi:10.1016/S0034-4257(02)00076-7</li>
        <li>Earth imagery: NASA Blue Marble Next Generation. Satellite models: NASA 3D Resources.</li>
      </ul>
    </main>
  );
}
