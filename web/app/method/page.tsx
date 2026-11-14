"use client";
// Method page: the full science behind FireCensus, written from docs/research.md and docs/findings-log.md.
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
          <line x1={L} x2={W - 10} y1={y(p)} y2={y(p)} stroke="#1F2A44" strokeDasharray={p === 0.5 ? "4 4" : ""} />
          <text x={L - 6} y={y(p) + 4} textAnchor="end" fontSize={11} fill="#94a3b8">{p * 100}%</text>
        </g>
      ))}
      {[1, 10, 100].map((v) => (
        <text key={v} x={x(v)} y={H - B + 16} textAnchor="middle" fontSize={11} fill="#94a3b8">{v} MW</text>
      ))}
      <text x={(W + L) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="#94a3b8">Fire radiative power (log scale), each sensor at its nadir pixel (MODIS 1 km, VIIRS 375 m)</text>
      {Object.entries(d.p_detect).map(([sat, ps]: any) => (
        <g key={sat}>
          <path d={ps.map((p: number, i: number) => `${i ? "L" : "M"}${x(xs[i])},${y(p)}`).join("")} fill="none" stroke={COLORS[sat]} strokeWidth={2.5} />
        </g>
      ))}
      {Object.keys(d.p_detect).map((sat, k) => (
        <g key={sat} transform={`translate(${L + 12},${22 + k * 18})`}>
          <line x1={0} x2={18} y1={0} y2={0} stroke={COLORS[sat]} strokeWidth={3} />
          <text x={24} y={4} fontSize={12} fill={COLORS[sat]}>{sat === "SNPP" ? "S-NPP (VIIRS)" : sat === "NOAA20" ? "NOAA-20 (VIIRS)" : sat === "NOAA21" ? "NOAA-21 (VIIRS)" : "Aqua (MODIS)"}</text>
        </g>
      ))}
    </svg>
  );
}

const SECTIONS = [
  ["why", "Why this matters now"],
  ["problem", "Two sensors, two pictures"],
  ["others", "How it is usually done"],
  ["idea", "Count fires like animals"],
  ["s1", "1 · Matching fires"],
  ["s2", "2 · Detection curves"],
  ["s3", "3 · Adding back unseen fires"],
  ["s4", "4 · Back to 2002"],
  ["s5", "5 · The products"],
  ["check", "Three estimators, one answer"],
  ["valid", "Validation"],
  ["compare", "Compared with other methods"],
  ["limits", "Limitations"],
  ["refs", "Data & references"],
] as const;

const H = ({ id, n, children }: { id: string; n?: string; children: React.ReactNode }) => (
  <h2 id={id} className="scroll-mt-20 pt-14 text-2xl font-semibold">{n && <span className="mr-2 text-fire">{n}</span>}{children}</h2>
);
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-3 max-w-3xl leading-relaxed text-slate-300">{children}</p>;
const F = ({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) => (
  <div className="mt-4 max-w-3xl rounded-xl border border-line bg-white/[0.03] px-5 py-4">
    <div className="overflow-x-auto font-mono text-[15px] text-white">{children}</div>
    {note && <div className="mt-2 text-xs leading-relaxed text-slate-400">{note}</div>}
  </div>
);
const Table = ({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) => (
  <div className="mt-4 max-w-4xl overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="text-left text-slate-400"><tr>{head.map((h, i) => <th key={i} className="py-1 pr-4 font-medium">{h}</th>)}</tr></thead>
      <tbody className="align-top">
        {rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className={`py-2 pr-4 ${j === 0 ? "text-slate-200" : "text-slate-300"}`}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);
const Callout = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-4 max-w-3xl rounded-xl border-l-4 border-fire bg-fire/5 px-4 py-3 text-[15px] leading-relaxed text-slate-200">{children}</div>
);
const Num = ({ children }: { children: React.ReactNode }) => <span className="num">{children}</span>;

export default function MethodPage() {
  return (
    <main className="mx-auto flex max-w-7xl gap-10 px-6 pb-24 pt-24">
      {/* table of contents */}
      <nav className="sticky top-20 hidden h-fit w-56 shrink-0 text-sm lg:block" aria-label="On this page">
        <div className="label mb-2">On this page</div>
        <ol className="space-y-1.5 text-slate-400">
          {SECTIONS.map(([id, t]) => <li key={id}><a href={`#${id}`} className="hover:text-white">{t}</a></li>)}
        </ol>
      </nav>

      <article className="min-w-0 flex-1">
        <div className="label text-fire">Method</div>
        <h1 className="mt-1 text-4xl font-semibold leading-tight">Counting the fires every satellite missed</h1>
        <P>
          MODIS and VIIRS look at the same fires with different eyes, so their raw counts can&apos;t be compared. Most approaches convert one
          sensor into the other with a ratio. FireCensus does something different: it treats every satellite pass as a <b>wildlife survey</b>, and
          uses capture–recapture statistics from ecology to estimate the true number of fires, <i>including the ones no satellite saw</i>.
          The result is one fire record for Southeast Asia from 2002 to 2026, on one scale, where the sensor no longer matters.
        </P>
        <Callout>
          In one sentence: <b>if two satellites each see some fires, how often they both see the same fire tells you how many fires neither of them saw.</b>{" "}
          Ecologists have counted fish, birds and whales this way for decades.
        </Callout>

        <H id="why">Why this matters now</H>
        <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-slate-300">
          <li><b>The MODIS record is ending.</b> NASA plans to stop Terra MODIS collections in January 2027 and Aqua MODIS around September 2027. Suomi NPP data production stopped on 1–2 November 2026, two weeks before this challenge.</li>
          <li><b>25 years of fire history is at risk.</b> Without a bridge, the MODIS era (2002–2011) and the VIIRS era (2012 onward) can&apos;t be read as one trend. A naive merge shows a fake jump the year VIIRS arrives.</li>
          <li><b>Southeast Asia is where it matters most.</b> Peat fires are small and smouldering, clouds and smoke hide them, and near the equator MODIS reliably detects even strong fires less than 30% of the time. The 2015 haze reached Indonesia, Malaysia, Singapore and Brunei.</li>
        </ul>

        <H id="problem">Two sensors, two different pictures</H>
        <P>The differences come mostly from how the sensors <i>sample</i> the ground and how small a fire they can notice, not from the fire algorithms themselves.</P>
        <Table head={["", "MODIS (Terra, Aqua)", "VIIRS 375 m (S-NPP, NOAA-20, NOAA-21)"]} rows={[
          ["Pixel at nadir", "1 km", "375 m"],
          ["Pixel at the scan edge", "Grows to several km²", "Kept small by on-board aggregation"],
          ["Afternoon overpass (local solar time)", "Aqua ≈ 13:30, drifting later (14:23 by 2025)", "≈ 13:20–13:30"],
          ["Smallest fire detected, day, nadir", "≈ 5.7 MW", "≈ 3.7 MW"],
          ["Smallest fire detected, night, nadir", "≈ 3.7 MW", "0.5–0.7 MW"],
          ["Chance of catching a strong fire, global / equatorial", "78% / < 30%", "88% / < 40%"],
          ["Median pixel area, our Southeast Asia data", "1.32 km²", "0.19 km²"],
          ["Median FRP of a detected fire, day", "21.1 MW", "5.8 MW"],
        ]} />
        <P>So the extra fires VIIRS sees are mostly <b>small fires</b>, not double counting. In our data, Aqua MODIS sees roughly <b>1 in 8</b> of the fires burning during Borneo&apos;s 2019 fire season.</P>

        <H id="others">How it is usually done</H>
        <P>Most approaches calibrate one count against the other: a regression, a monthly ratio or quantile mapping, usually shrinking VIIRS down to MODIS. That has four blind spots:</P>
        <ol className="mt-3 max-w-3xl list-decimal space-y-2 pl-5 text-slate-300">
          <li><b>VIIRS is treated as a nuisance.</b> Shrinking VIIRS to MODIS throws away exactly the small fires that matter in peatlands.</li>
          <li><b>One ratio absorbs every difference.</b> Pixel size, scan angle, cloud, overpass time and fire size each act differently, so a single ratio breaks when the season or region changes.</li>
          <li><b>No answer after MODIS ends.</b> A calibration MODIS = f(VIIRS) can&apos;t be checked once MODIS is gone.</li>
          <li><b>Uncertainty is added afterwards</b>, as residuals of the calibration, rather than from a model of what was missed.</li>
        </ol>

        <H id="idea">Our idea: count fires like ecologists count animals</H>
        <P>
          To count fish in a lake you catch some, mark them, release them, and fish again. If 1 in 10 of the second catch is marked, the lake holds about 10 times
          your first catch. You never see every fish, but the <i>overlap</i> between catches tells you how many you missed. FireCensus applies the same logic to satellites:
        </P>
        <Table head={["Ecology", "FireCensus"]} rows={[
          ["An animal", "A fire: detections within 1.5 km of each other in the same afternoon window"],
          ["A trapping session", "One satellite pass: Aqua MODIS, S-NPP VIIRS, NOAA-20 VIIRS (NOAA-21 as an independent check)"],
          ["Capture history", "Who saw each fire, e.g. (Aqua, S-NPP, NOAA-20) = (0, 1, 1)"],
          ["Animals far from the observer are missed", "Fires in large pixels (far from nadir) are missed"],
          ["Bigger animals are easier to spot", "Hotter fires (higher FRP) are easier to detect"],
          ["Closed population during the survey", "Fires burning during one 3-hour afternoon window"],
          ["Animals never caught", "Fires no satellite detected: estimated, not observed"],
        ]} />
        <P>As far as we could find, capture–recapture has not been applied to MODIS/VIIRS active-fire records before. It has been used to estimate fire numbers from two agencies&apos; incident databases, which shows the idea works for fire inventories.</P>

        <H id="s1" n="1">Matching fires across satellites</H>
        <P>
          We use NASA FIRMS detections (MODIS Collection 6.1, VIIRS 375 m) for Southeast Asia, July 2002 to November 2026, about 61 million detections. Only the
          afternoon passes are used, 12:30–15:30 local solar time, because Aqua, S-NPP and NOAA-20 all fly then (median 13:20–13:27 in 2019). Detections are
          clustered within 1.5 km; each cluster is one fire with a capture history:
        </P>
        <Table head={["History (Aqua, S-NPP, NOAA-20)", "Meaning", "Borneo, Aug–Oct 2019"]} rows={[
          [<Num key="a">(0,1,0)</Num>, "Seen by S-NPP only", "17,488"],
          [<Num key="b">(0,0,1)</Num>, "Seen by NOAA-20 only", "17,131"],
          [<Num key="c">(0,1,1)</Num>, "Small fire: only the 375 m sensors saw it", "8,052"],
          [<Num key="d">(1,1,1)</Num>, "Big fire: every satellite saw it", "3,719"],
          [<Num key="e">(1,0,0)</Num>, "Seen by Aqua only", "2,177"],
          [<Num key="f">(–,1,1)</Num>, "Aqua did not pass over: missing, not a miss", "treated as unavailable"],
          [<span key="g" className="num text-fire">(0,0,0)</span>, "Never seen: estimated, not observed", "?"],
        ]} />
        <P>Only 7% of Borneo&apos;s fires were seen by all three. Even before any model, the raw data show the detection curve: Aqua catches 3% of fires under 2 MW, 14% at 5–10 MW, 37% at 20–50 MW and 54% above 100 MW (S-NPP: 49% to 73%).</P>
        <Callout>
          <b>A finding along the way: fires appear and disappear within minutes.</b> S-NPP and NOAA-20 carry the same instrument, yet NOAA-20 re-saw only 32% of
          S-NPP&apos;s fires in 2019 (passes ~50 min apart) and 41% in 2025 (~25 min apart). Halving the gap raised the recapture rate, so many small fires ignite
          or die out between passes. We therefore define the estimate as <b>fires burning during the afternoon window</b>, and learn detection from the closest-in-time
          pairs. This also explains why a single ratio between sensors drifts over the years.
        </Callout>

        <H id="s2" n="2">Each satellite&apos;s detection curve (Huggins model)</H>
        <P>A Huggins conditional-likelihood capture–recapture model gives each satellite its own probability of detecting each fire, from the fire&apos;s heat and the pixel size at that scan angle:</P>
        <F note={<>p<sub>is</sub>: chance that satellite s detects fire i · FRP: fire radiative power (MW) · A: pixel area (km²). Fitted on the 2012–2021 overlap years, afternoon window.</>}>
          logit p<sub>is</sub> = α<sub>s</sub> + β<sub>1s</sub>·log FRP<sub>i</sub> + β<sub>2s</sub>·log A<sub>is</sub>
        </F>
        <Table head={["Satellite", "α (intercept)", "β₁ (log FRP)", "β₂ (log pixel area)"]} rows={[
          ["Aqua (MODIS)", "−4.61", "+1.60", "−1.45"],
          ["S-NPP (VIIRS)", "−4.34", "+0.73", "−1.62"],
          ["NOAA-20 (VIIRS)", "−4.97", "+0.83", "−1.91"],
        ]} />
        <P>
          The signs are what physics predicts: hotter fires are easier to see, larger pixels make them harder. Aqua&apos;s curve depends much more steeply on fire
          size, so <b>small fires are exactly what MODIS misses</b>. The two VIIRS units have nearly the same curve, an internal consistency check. MODIS FRP is put
          on the VIIRS scale with a regression on fires both saw: log FRP<sub>VIIRS</sub> = 0.516 + 0.635·log FRP<sub>MODIS</sub>.
        </P>
        <div className="mt-6"><Curves /></div>
        <P>
          Aqua reaches a 50% chance of detection at about <b>25 MW</b> on a 1 km² pixel; the VIIRS units reach it at 13–15 MW on their ~0.2 km² pixels. Our 50% points
          are about 3× higher than the clear-sky physical limits of Sofiev &amp; Kouznetsov (2026), because our probability also includes cloud, smoke and fires dying
          out between passes. The trend with pixel size agrees.
        </P>

        <H id="s3" n="3">Adding back the fires nobody saw (Horvitz–Thompson)</H>
        <P>The chance that at least one available satellite catches fire i combines the individual curves. Each observed fire then counts for itself plus the similar fires that slipped past every satellite:</P>
        <F note={<>Only satellites that actually passed over the fire enter the product. Weights are capped at 20 (p* ≥ 0.05) so a single faint detection can&apos;t dominate a cell.</>}>
          p*<sub>i</sub> = 1 − Π<sub>s</sub> (1 − p<sub>is</sub>)      N̂ = Σ<sub>i</sub> 1 / p*<sub>i</sub>
        </F>
        <P>Example: a 2 MW fire seen only by NOAA-20 might have p* = 0.47, so it counts as 2.1 fires. On the map, zoom in and pick the FireCensus lens: the violet rings are these unseen fires, drawn around the detection they come from.</P>

        <H id="s4" n="4">Back to 2002, before VIIRS</H>
        <P>From 2002 to 2011 only MODIS flew. Each Aqua fire is first weighted by Aqua&apos;s own curve; then the overlap years tell us how many fires even that misses, by subregion and month:</P>
        <F note={<>g: maritime (Indonesia, Malaysia, Brunei) or mainland (Thailand, Myanmar, Laos, Cambodia) · m: calendar month · R is fitted on 2012–2021 only.</>}>
          N̂<sub>g,m</sub> = R<sub>g,m</sub> · Σ<sub>i ∈ Aqua</sub> 1 / p<sub>i,Aqua</sub>      R<sub>g,m</sub> = Σ 1/p*<sub>i</sub> ÷ Σ 1/p<sub>i,Aqua</sub>
        </F>
        <P>
          R is 1.75–2.55 in the maritime region and 2.06–3.92 on the mainland, highest in August–November when small agricultural fires dominate. The back-cast uses
          only information MODIS itself provides, so the same rule applies before and after 2012 and there is no seam to hide.
        </P>

        <H id="s5" n="5">The products</H>
        <Table head={["Product", "Definition"]} rows={[
          ["Harmonized fire count (main unit)", "N̂: VIIRS-equivalent fires burning in the afternoon window, including unseen ones. Per 0.1° cell and month, July 2002 to November 2026."],
          ["Burning calendar", "Year × month heat map of N̂, with the typical year: median, 25th and 75th percentile over 2003–2025."],
          ["This month vs history", "Ratio to the same-month median and percentile rank; above normal ≥ 75th percentile, below normal ≤ 25th."],
          ["Fire season (critical period)", "Months whose median is at least half of the peak month's."],
          ["Unusual periods", "Months above the 90th percentile for their calendar month."],
          ["Downloads", "Monthly series (FireCensus plus each raw sensor) and 0.1° cells, for any area you draw and any date range."],
        ]} />
        <P>
          <b>2026, near real time.</b> August–November 2026 come from FIRMS near-real-time files, which have no fire-type field; static heat sources (industry,
          volcanoes) are masked using cells flagged in the science-quality archive. 2026 is computed with the 2012–2021 model so it stays comparable with every earlier
          year. After S-NPP stopped on 2 November 2026, fires are estimated from Aqua and NOAA-20 automatically.
        </P>

        <H id="check">Three estimators, one answer</H>
        <P>Capture–recapture has several classic estimators with different assumptions. If they roughly agree, the result does not hinge on one modelling choice.</P>
        <Table head={["Estimator", "Assumption", "Borneo, Aug–Oct 2019 (52,188 fires seen)"]} rows={[
          ["Lincoln–Petersen (two satellites)", "Every fire equally easy to catch", "Shown live for any region in the story on the map"],
          ["Log-linear multiple-systems model", "Satellites may be correlated (the two VIIRS units are); chosen by AIC", "72,380 fires (1.39× observed)"],
          ["Huggins + Horvitz–Thompson (FireCensus)", "Detection depends on fire heat and pixel size", "85,556 fires (1.64× observed)"],
        ]} />
        <P>
          The plausible range is 72–86 thousand fires, 1.4–1.6 times what was observed. Horvitz–Thompson is the highest because it is the only one that accounts for
          small fires being harder to catch. For Indonesia in September 2019, Lincoln–Petersen on Aqua and S-NPP gives 54,641 fires; FireCensus gives 60,032 for the same fires.
        </P>

        <H id="valid">Validation</H>
        <Table head={["Test", "Result"]} rows={[
          ["Leave-one-year-out back-cast (2012–2021, 240 subregion-months with > 200 fires)", <>Median error <b>12.5%</b> vs 14.0% for a naive ratio; <b>5.6%</b> vs 7.5% in peak months; log correlation 0.988. To be honest: the gain is modest, and the reference is the three-satellite estimate, so this tests the back-cast&apos;s consistency rather than ground truth.</>],
          ["Drop one sensor (2023–2025, 4-sensor model)", <>Raw counts change 15–25%; FireCensus changes only <b>0–6%</b>. The sensor of origin no longer matters.</>],
          ["2011 → 2012 sensor switch (Indonesia)", <>Using the newest satellite, the count jumps <b>×4.4</b>; FireCensus moves −4% (363 k → 349 k).</>],
          ["Seam between eras", "N̂ ÷ raw Aqua: 13–14 in 2009–11 vs 11–12 in 2012–14 (maritime). A ~10% step, within the back-cast error."],
          ["Burning calendar vs raw VIIRS (no model)", "Same peak months: Thailand Mar–Feb–Apr, Indonesia Sep–Oct–Aug."],
          ["Australia control (Black Summer 2019–20)", "Hot, large fires get a small correction (1.06–1.27×) vs Borneo peat (1.24–1.64×). The method does not simply inflate everything."],
          ["Clustering distance 1.5 → 3 km", "Aqua's 50% point 18.5 → 16.9 MW; correction factor 1.64 → 1.56. Conclusions unchanged."],
          ["NOAA-21 as a 4th, never-fitted sensor", "FRP for 50% detection (0.2 km² pixel): S-NPP 14.8, NOAA-20 15.1, NOAA-21 13.1 MW. The VIIRS units are interchangeable, so the record continues after S-NPP and MODIS."],
        ]} />

        <H id="compare">Compared with other methods</H>
        <Table head={["", "Ratio / quantile calibration", "FireCensus"]} rows={[
          ["Question asked", "MODIS = f(VIIRS)", "How many fires burned, given what each satellite saw?"],
          ["VIIRS small fires", "Shrunk away", "Used to learn what MODIS misses"],
          ["Fires no satellite saw", "Not estimated", "Estimated per fire and per cell"],
          ["After MODIS ends (2027)", "Calibration can't be checked", "Same model with VIIRS only (tested with NOAA-21)"],
          ["Uncertainty", "Residuals after the fact", "From the capture model; larger where fewer satellites passed"],
          ["Explainability", "One number per region", "A detection curve per satellite, with physical meaning"],
        ]} />

        <H id="limits">Limitations</H>
        <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-slate-300">
          <li><b>Closure.</b> Capture–recapture assumes the fire population is stable during the 3-hour window. It isn&apos;t entirely: we measured how recapture falls with the time gap between passes, and define the estimate as <i>fires burning during the window</i>.</li>
          <li><b>Hidden differences between fires</b> (cloud, canopy, peat depth) that the model does not include make N̂ conservative. Models calibrated on different periods differ by about 20% (2023–25 vs 2012–21, partly Aqua&apos;s orbit drift). Every year uses the same 2012–2021 calibration, so comparisons over time are fair.</li>
          <li><b>2002–2011 single cells are noisy</b>: each Aqua fire stands for about 13 VIIRS-equivalent fires. Use regional totals or 0.5° cells for that era. Aqua data start in July 2002, so the 2002 mainland season (Jan–Apr) is missing.</li>
          <li><b>Near-real-time 2026</b> data have no fire-type field; static heat sources are masked with archive flags, which may miss new industrial sites.</li>
          <li><b>N̂ counts fire events</b>, not burned area or emissions. The smouldering peat fires of 2015 emitted more smoke than their count suggests.</li>
          <li><b>Afternoon only.</b> Night passes and Terra&apos;s morning pass are not in the model yet.</li>
          <li><b>Map position of unseen fires</b> is illustrative (within ~2 km of the detection they are inferred from); only their number is estimated.</li>
        </ul>

        <H id="refs">Data &amp; references</H>
        <div className="label mt-4">Data</div>
        <ul className="mt-2 max-w-3xl space-y-1 text-sm text-slate-300">
          <li>We acknowledge the use of data from LANCE FIRMS, operated by NASA&apos;s Earth Science Data and Information System (ESDIS). <a className="text-sat underline" href="https://www.earthdata.nasa.gov/data/tools/firms">earthdata.nasa.gov/data/tools/firms</a></li>
          <li>MODIS Collection 6.1 (Aqua) and VIIRS 375 m (S-NPP, NOAA-20, NOAA-21) active fires, standard and near-real-time products.</li>
          <li>Map imagery: NASA GIBS, Blue Marble. Earth texture: NASA Blue Marble Next Generation. Satellite models: NASA 3D Resources. Country outlines: Natural Earth.</li>
        </ul>
        <div className="label mt-5">Fire remote sensing</div>
        <ul className="mt-2 max-w-3xl space-y-1 text-sm text-slate-300">
          <li>Giglio, Schroeder &amp; Justice (2016). The Collection 6 MODIS active fire detection algorithm and fire products. Remote Sensing of Environment. doi:10.1016/j.rse.2016.02.054</li>
          <li>Schroeder et al. (2014). The New VIIRS 375 m active fire detection data product. Remote Sensing of Environment. doi:10.1016/j.rse.2013.12.008</li>
          <li>Davies et al. (2009). Fire Information for Resource Management System (FIRMS). IEEE TGRS. doi:10.1109/TGRS.2008.2002076</li>
          <li>Justice et al. (2002). The MODIS fire products. Remote Sensing of Environment. doi:10.1016/S0034-4257(02)00076-7</li>
          <li>Sofiev &amp; Kouznetsov (2026). Observation operator and detection limits for MODIS and VIIRS fire radiative power products. Geoscientific Model Development 19, 10123.</li>
          <li>Fu et al. (2020): mutual omission of MODIS and VIIRS fire pixels in Northeast Asia (VIIRS pixels missed by MODIS 65–83%, MODIS pixels missed by VIIRS 35–53%).</li>
          <li>Atwood et al. (2016): the 2015 Southeast Asian peat fires and transboundary haze (PMC4972419).</li>
        </ul>
        <div className="label mt-5">Capture–recapture statistics</div>
        <ul className="mt-2 max-w-3xl space-y-1 text-sm text-slate-300">
          <li>Petersen (1896) and Lincoln (1930): the two-sample mark–recapture estimator N ≈ n₁n₂ / m.</li>
          <li>Huggins (1989). On the statistical analysis of capture experiments. Biometrika 76, 133–140.</li>
          <li>Horvitz &amp; Thompson (1952). A generalization of sampling without replacement from a finite universe. Journal of the American Statistical Association 47, 663–685.</li>
          <li>Fienberg (1972). The multiple recapture census for closed populations and incomplete 2<sup>k</sup> contingency tables. Biometrika 59, 591–603.</li>
        </ul>
        <P>Full working notes: <code>docs/research.md</code> and <code>docs/findings-log.md</code> in the repository.</P>
      </article>
    </main>
  );
}
