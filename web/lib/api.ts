export const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export type Region = { country?: string; bbox?: string };

export type SeriesRow = {
  year: number;
  month: number;
  n_hat: number;
  n_obs: number;
  aqua_raw?: number;
  snpp_raw?: number;
  noaa20_raw?: number;
  naive_best_sensor?: number;
  sensor_era: string;
};

export type CalendarMonth = { month: number; n_median: number; n_p25: number; n_p75: number; n_max: number; critical: boolean };

export type Compare = {
  year: number; month: number; n_hat: number; median: number; ratio_to_median: number;
  percentile: number | null; status: string; history: { year: number; n_hat: number }[];
};

export type Cell = { lat: number; lon: number; n_hat: number; n_obs: number; n_median: number; anomaly: number; ratio: number };

function qs(params: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && p.set(k, String(v)));
  return p.toString();
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const r = await fetch(`${API}${path}?${qs(params)}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${r.status}`);
  }
  return r.json();
}

export const api = {
  health: () => get<{ ok: boolean }>("/health"),
  meta: () => get<any>("/meta"),
  timeseries: (reg: Region, start?: string, end?: string) =>
    get<{ series: SeriesRow[] }>("/timeseries", { ...reg, start, end }),
  calendar: (reg: Region) => get<{ critical_months: number[]; months: CalendarMonth[] }>("/calendar", { ...reg }),
  compare: (reg: Region, year: number, month: number) => get<Compare>("/compare", { ...reg, year, month }),
  cells: (year: number, month: number, res: number, reg: Region = {}) =>
    get<{ cells: Cell[]; total_n_hat: number; spatial_confidence: string; note: string | null }>("/cells", { year, month, res, ...reg }),
  curves: () => get<any>("/method/detection-curves"),
  csvTimeseries: (reg: Region, start?: string, end?: string) => `${API}/export/timeseries.csv?${qs({ ...reg, start, end })}`,
  csvCells: (reg: Region, start: string, end: string) => `${API}/export/cells.csv?${qs({ ...reg, start, end })}`,
};
