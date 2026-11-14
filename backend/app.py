"""FireCensus API (FastAPI + DuckDB over the parquet product in data/product).

Run:  uvicorn app:app --reload --port 8000      (from the backend/ folder)
Docs: http://127.0.0.1:8000/docs

Region selection: either `country=` or `bbox=minLon,minLat,maxLon,maxLat`.
Dates: `start=YYYY-MM`, `end=YYYY-MM` (inclusive). Single month: `year=`, `month=`.
N  = harmonized fire count (VIIRS-equivalent, includes estimated unseen fires).
"""
import io
import json
import math
import os
from pathlib import Path
from typing import Optional

import duckdb
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse

ROOT = Path(os.environ.get("FIRECENSUS_ROOT", Path(__file__).resolve().parents[1]))
PRODUCT = ROOT / "data" / "product"
MODELS = ROOT / "data" / "interim" / "models"
CLIM_YEARS = (2003, 2025)

app = FastAPI(title="FireCensus API", version="0.1.0",
              description="Harmonized MODIS + VIIRS active-fire counts for Southeast Asia, 2002-2025.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

DB = duckdb.connect()
for name in ["cells_month", "cells_clim", "country_month", "country_calendar"]:
    DB.execute(f"CREATE TABLE {name} AS SELECT * FROM read_parquet('{(PRODUCT / (name + '.parquet')).as_posix()}')")
FIT = json.loads((MODELS / "backcast_fit_SEA_PM.json").read_text())
BACKCAST = json.loads((MODELS / "backcast_SEA_PM.json").read_text())
COUNTRIES = [r[0] for r in DB.execute("SELECT DISTINCT country FROM country_month ORDER BY 1").fetchall()]


# ---------- helpers ----------
def q(sql, params=None):
    cur = DB.cursor()
    return cur.execute(sql, params or []).df()


def ym(s: str):
    try:
        y, m = s.split("-")
        return int(y), int(m)
    except Exception:
        raise HTTPException(400, f"bad date '{s}', expected YYYY-MM")


def region_filter(country: Optional[str], bbox: Optional[str], cell_level: bool):
    """SQL WHERE fragment + params. Country works on both levels; bbox only on cell level."""
    if country and bbox:
        raise HTTPException(400, "give country or bbox, not both")
    if country:
        if country not in COUNTRIES:
            raise HTTPException(404, f"unknown country; choose from {COUNTRIES}")
        return "country = ?", [country]
    if bbox:
        try:
            x0, y0, x1, y1 = [float(v) for v in bbox.split(",")]
        except Exception:
            raise HTTPException(400, "bbox must be minLon,minLat,maxLon,maxLat")
        if not cell_level:
            return None, None
        return "lon_c BETWEEN ? AND ? AND lat_c BETWEEN ? AND ?", [x0, x1, y0, y1]
    return "TRUE", []


def date_filter(start: Optional[str], end: Optional[str]):
    y0, m0 = ym(start) if start else (2002, 1)
    y1, m1 = ym(end) if end else (2026, 11)
    return "(year*100+month) BETWEEN ? AND ?", [y0 * 100 + m0, y1 * 100 + m1]


def csv_response(df, filename):
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def records(df):
    return json.loads(df.to_json(orient="records"))


def monthly_series(country, bbox, start, end):
    """Monthly N and observed counts for a region, zero-filled over the requested range."""
    df_sql, df_p = date_filter(start, end)
    if country or not bbox:
        rf, rp = region_filter(country, None, False)
        s = q(f"""SELECT year, month, sum(n_hat) n_hat, sum(n_obs) n_obs,
                         sum(aqua_raw) aqua_raw, sum(snpp_raw) snpp_raw, sum(noaa20_raw) noaa20_raw
                  FROM country_month WHERE {rf} AND {df_sql} GROUP BY year, month""", rp + df_p)
    else:
        rf, rp = region_filter(None, bbox, True)
        s = q(f"""SELECT year, month, sum(n_hat) n_hat, sum(n_obs) n_obs
                  FROM cells_month WHERE {rf} AND {df_sql} GROUP BY year, month""", rp + df_p)
    y0, m0 = ym(start) if start else (2002, 1)
    y1, m1 = ym(end) if end else (2026, 11)
    grid = [(y, m) for y in range(y0, y1 + 1) for m in range(1, 13) if y0 * 100 + m0 <= y * 100 + m <= y1 * 100 + m1]
    import pandas as pd
    g = pd.DataFrame(grid, columns=["year", "month"])
    s = g.merge(s, on=["year", "month"], how="left").fillna(0)
    s["sensor_era"] = np.where(s.year < 2012, "MODIS (Aqua) only, back-cast", "MODIS + VIIRS")
    if "snpp_raw" in s:
        s["naive_best_sensor"] = np.where(s.year < 2012, s.aqua_raw, s.snpp_raw)
    return s


# ---------- endpoints ----------
@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/docs")


@app.get("/health")
def health():
    return {"ok": True, "cells_month_rows": int(DB.execute("SELECT count(*) FROM cells_month").fetchone()[0])}


@app.get("/meta")
def meta():
    return {
        "countries": COUNTRIES,
        "years": [2002, 2026],
        "grid_deg": 0.1,
        "climatology_years": list(CLIM_YEARS),
        "window": "PM overpass (12:30-15:30 local solar time): Aqua MODIS, S-NPP VIIRS, NOAA-20 VIIRS",
        "notes": [
            "N is a VIIRS-equivalent fire count including fires no satellite saw (capture-recapture estimate).",
            "2002 is partial: Aqua data start July 2002.",
            "2002-2011 values are back-cast from Aqua alone (Model 3); 2012+ use all three sensors.",
            "2026: Aug-Nov from near-real-time data (no fire-type field; static sources masked). S-NPP ended 2026-11-02; afterwards Aqua + NOAA-20 only (drop-one tests: N changes 0-6%).",
        ],
        "source": "NASA FIRMS standard processing (MODIS C6.1, VIIRS 375 m); FireCensus harmonization.",
    }


@app.get("/cells")
def cells(year: int, month: int, bbox: Optional[str] = None, country: Optional[str] = None,
          res: float = Query(0.25, description="display grid: 0.1, 0.25 or 0.5 deg")):
    """Map layer: N per cell for one month, with the historical median for that month and the anomaly."""
    if res not in (0.1, 0.25, 0.5):
        raise HTTPException(400, "res must be 0.1, 0.25 or 0.5")
    rf, rp = region_filter(country, bbox, True)
    k = round(res / 0.1)
    df = q(f"""
      WITH cur AS (SELECT ci, cj, n_hat, n_obs, burning_days FROM cells_month
                   WHERE year=? AND month=? AND {rf}),
           clim AS (SELECT ci, cj, n_median FROM cells_clim WHERE month=? AND {rf}),
           j AS (SELECT coalesce(cur.ci, clim.ci) ci, coalesce(cur.cj, clim.cj) cj,
                        coalesce(n_hat,0) n_hat, coalesce(n_obs,0) n_obs, coalesce(burning_days,0) burning_days,
                        coalesce(n_median,0) n_median
                 FROM cur FULL JOIN clim USING (ci, cj))
      SELECT (floor(ci/{k})*{k} + {k}/2.0)/10 AS lat, (floor(cj/{k})*{k} + {k}/2.0)/10 AS lon,
             round(sum(n_hat),1) n_hat, sum(n_obs) n_obs, max(burning_days) burning_days_max,
             round(sum(n_median),1) n_median
      FROM j GROUP BY 1, 2 HAVING sum(n_hat) > 0 OR sum(n_median) > 0""", [year, month] + rp + [month] + rp)
    df["anomaly"] = (df.n_hat - df.n_median).round(1)
    df["ratio"] = ((df.n_hat + 1) / (df.n_median + 1)).round(2)
    note = ("2002-2011 is back-cast from Aqua alone: each detected fire stands for ~13 VIIRS-equivalent fires, "
            "so single cells are noisy. Use res=0.5 or regional totals for this era.") if year < 2012 else None
    return {"year": year, "month": month, "res": res, "spatial_confidence": "low" if year < 2012 else "normal",
            "note": note, "n_cells": len(df),
            "total_n_hat": round(float(df.n_hat.sum())), "cells": records(df)}


@app.get("/timeseries")
def timeseries(country: Optional[str] = None, bbox: Optional[str] = None,
               start: Optional[str] = None, end: Optional[str] = None):
    """Monthly harmonized N vs. raw counts (shows the 2012 jump that harmonization removes)."""
    s = monthly_series(country, bbox, start, end)
    return {"region": country or bbox or "all", "series": records(s.round(1))}


@app.get("/calendar")
def calendar(country: Optional[str] = None, bbox: Optional[str] = None):
    """Burning calendar: typical N per month-of-year (median, p25, p75 over 2003-2025) + critical months."""
    if country or not bbox:
        rf, rp = region_filter(country, None, False)
        if country:
            df = q(f"SELECT month, n_median, n_p25, n_p75, n_max FROM country_calendar WHERE {rf} ORDER BY month", rp)
        else:
            s = monthly_series(None, None, f"{CLIM_YEARS[0]}-01", f"{CLIM_YEARS[1]}-12")
            df = s.groupby("month").n_hat.quantile([0.5, 0.25, 0.75]).unstack()
            df.columns = ["n_median", "n_p25", "n_p75"]
            df["n_max"] = s.groupby("month").n_hat.max()
            df = df.reset_index()
    else:
        s = monthly_series(None, bbox, f"{CLIM_YEARS[0]}-01", f"{CLIM_YEARS[1]}-12")
        df = s.groupby("month").n_hat.quantile([0.5, 0.25, 0.75]).unstack()
        df.columns = ["n_median", "n_p25", "n_p75"]
        df["n_max"] = s.groupby("month").n_hat.max()
        df = df.reset_index()
    peak = df.n_median.max()
    df["critical"] = df.n_median >= 0.5 * peak if peak > 0 else False
    return {"region": country or bbox or "all", "years": list(CLIM_YEARS),
            "critical_months": [int(m) for m in df.month[df.critical]], "months": records(df.round(1))}


@app.get("/compare")
def compare(year: int, month: int, country: Optional[str] = None, bbox: Optional[str] = None):
    """This month vs. the same month in other years: median, percentile rank, status."""
    s = monthly_series(country, bbox, f"{CLIM_YEARS[0]}-{month:02d}", f"{CLIM_YEARS[1]}-{month:02d}")
    hist = s[(s.month == month) & (s.year != year)].n_hat.values
    cur = s[(s.year == year) & (s.month == month)].n_hat
    if not len(cur):
        cur_val = float(monthly_series(country, bbox, f"{year}-{month:02d}", f"{year}-{month:02d}").n_hat.iloc[0])
    else:
        cur_val = float(cur.iloc[0])
    med = float(np.median(hist)) if len(hist) else 0.0
    pct = float((hist < cur_val).mean() * 100) if len(hist) else None
    status = "above normal" if pct is not None and pct >= 75 else "below normal" if pct is not None and pct <= 25 else "near normal"
    return {"region": country or bbox or "all", "year": year, "month": month,
            "n_hat": round(cur_val), "median": round(med), "ratio_to_median": round((cur_val + 1) / (med + 1), 2),
            "percentile": None if pct is None else round(pct), "status": status,
            "history": records(s[s.month == month][["year", "n_hat"]].round(0))}


@app.get("/export/timeseries.csv")
def export_timeseries(country: Optional[str] = None, bbox: Optional[str] = None,
                      start: Optional[str] = None, end: Optional[str] = None):
    s = monthly_series(country, bbox, start, end)
    tag = (country or (bbox or "all").replace(",", "_")).replace(" ", "_")
    return csv_response(s.round(2), f"firecensus_timeseries_{tag}.csv")


@app.get("/export/cells.csv")
def export_cells(start: str, end: str, country: Optional[str] = None, bbox: Optional[str] = None):
    """Cell x month harmonized counts (0.1 deg) for a region and date range. Capped at 500k rows."""
    rf, rp = region_filter(country, bbox, True)
    df_sql, df_p = date_filter(start, end)
    df = q(f"""SELECT year, month, lat_c AS lat, lon_c AS lon, country, era,
                      n_obs, round(n_hat, 2) n_hat, burning_days, round(frp_sum, 1) frp_sum_mw
               FROM cells_month WHERE {rf} AND {df_sql} ORDER BY year, month, lat, lon LIMIT 500000""", rp + df_p)
    tag = (country or (bbox or "all").replace(",", "_")).replace(" ", "_")
    return csv_response(df, f"firecensus_cells_{tag}_{start}_{end}.csv")


@app.get("/method/detection-curves")
def detection_curves(area_km2: float = 1.0):
    """Probability each sensor detects a fire vs. its FRP (Huggins model, pooled 2012-2021)."""
    frp = np.round(np.logspace(np.log10(0.5), np.log10(500), 60), 3)
    out = {}
    for sat, c in FIT["coefs"].items():
        eta = c["intercept"] + c["log_frp"] * np.log(frp) + c["log_area"] * math.log(area_km2)
        out[sat] = np.round(1 / (1 + np.exp(-eta)), 4).tolist()
    return {"frp_mw": frp.tolist(), "pixel_area_km2": area_km2, "p_detect": out,
            "frp_map": FIT["frp_map"], "validation_E2": BACKCAST.get("validation_E2")}


CASES = [
    {"id": "borneo-2019", "title": "Borneo & Sumatra haze, Sep 2019", "year": 2019, "month": 9,
     "bbox": "95,-6,120,6", "why": "Positive Indian Ocean Dipole drought year; densest overlap of all three sensors."},
    {"id": "indonesia-2015", "title": "Indonesia 2015 El Niño fires", "year": 2015, "month": 9,
     "bbox": "95,-6,120,6", "why": "Worst haze crisis of the VIIRS era."},
    {"id": "indonesia-2006", "title": "Indonesia 2006 (MODIS-only era)", "year": 2006, "month": 10,
     "bbox": "95,-6,120,6", "why": "Back-cast year: shows the fires MODIS alone could not see."},
    {"id": "mainland-2020", "title": "Mainland SE Asia burning season, Mar 2020", "year": 2020, "month": 3,
     "bbox": "92,10,110,24", "why": "Agricultural burning: many small fires, the hardest case for MODIS."},
]


@app.get("/cases")
def cases():
    return CASES
