// Accessible colour ramps (research.md / page-flow.md section 7).
// viridis for magnitude (colour-blind safe, readable in grayscale),
// RdBu for anomaly (blue = below the historical median, red = above).

const VIRIDIS = ["#440154", "#482878", "#3e4a89", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"];
const RDBU = ["#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b"];

function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function ramp(stops: string[], t: number) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export const viridis = (t: number) => ramp(VIRIDIS, t);

/** ratio = value / median. 1 -> white; 1/4 -> deep blue; 4 -> deep red (log scale). */
export const rdbu = (ratio: number) => {
  const t = 0.5 + Math.log2(Math.max(ratio, 1e-3)) / 4; // log2(4)=2 -> t = 1
  return ramp(RDBU, t);
};

export const VIRIDIS_STOPS = VIRIDIS;
export const RDBU_STOPS = RDBU;

export const fmt = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? "–" : Math.round(n).toLocaleString("en-US");

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
