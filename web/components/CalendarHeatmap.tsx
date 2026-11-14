"use client";
// 2D year x month burning calendar: same data and colours as the 3D skyline (Top view equivalent).
import { MONTHS, viridis, rdbu } from "@/lib/colors";
import type { Grid } from "./Skyline3D";

export default function CalendarHeatmap({ grid, anomaly, log, selected, onHover, onPick }: {
  grid: Grid; anomaly: boolean; log: boolean; selected?: { y: number; m: number } | null;
  onHover: (h: { y: number; m: number } | null) => void; onPick: (h: { y: number; m: number }) => void;
}) {
  let max = 1;
  grid.years.forEach((y) => { for (let m = 1; m <= 12; m++) max = Math.max(max, grid.value(y, m)); });
  const cw = 46, ch = 16, left = 44, top = 20;
  const W = left + 12 * cw + 8, H = top + grid.years.length * ch + 8;
  return (
    <div className="h-full w-full overflow-auto p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-full max-h-full w-auto max-w-full" role="img"
        aria-label="Burning calendar: fire counts by year (rows) and month (columns)">
        {MONTHS.map((m, i) => (
          <text key={m} x={left + i * cw + cw / 2} y={14} textAnchor="middle" fontSize={10} fill="#94a3b8">{m}</text>
        ))}
        {grid.years.map((y, yi) => (
          <g key={y}>
            <text x={left - 6} y={top + yi * ch + ch / 2 + 3} textAnchor="end" fontSize={10} fill="#94a3b8" className="num">{y}</text>
            {MONTHS.map((_, mi) => {
              const v = grid.value(y, mi + 1);
              const fill = v <= 0 ? "#151c2e" : anomaly ? rdbu(grid.ratio(y, mi + 1)) : viridis(log ? Math.log1p(v) / Math.log1p(max) : Math.sqrt(v / max));
              const sel = selected && selected.y === y && selected.m === mi + 1;
              return (
                <rect key={mi} x={left + mi * cw + 1} y={top + yi * ch + 1} width={cw - 2} height={ch - 2} rx={3}
                  fill={fill} stroke={sel ? "#fff" : "none"} strokeWidth={2} className="cursor-pointer"
                  onMouseEnter={() => onHover({ y, m: mi + 1 })} onMouseLeave={() => onHover(null)}
                  onClick={() => onPick({ y, m: mi + 1 })}>
                  <title>{`${MONTHS[mi]} ${y}: ${Math.round(v).toLocaleString("en-US")}`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
