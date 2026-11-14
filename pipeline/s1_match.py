"""Steps 1-2 - overpass reconstruction and fire matching (research.md, sections 2-3).

For each capture window (afternoon / night) on each local solar date, detections
from all platforms in the window are clustered with DBSCAN (haversine distance).
Each cluster is one *fire*; its capture history says which platforms saw it.

Rules (fixed in research.md section 3 before looking at results):
  * keep fire_type == 0 (vegetation fires) only
  * overpass  = same platform, consecutive detections <= 10 min apart
  * windows   = afternoon 12:30-15:30 LST, night 00:30-03:30 LST
                (Terra is outside both windows and is used later for the diurnal cycle)
  * DBSCAN    eps = 1.5 km, min_samples = 1 (sensitivity: 1.0 / 2.0 / 3.0 km)
  * coverage  = a platform "flew over" a fire if the same window has a detection
                from that platform within 300 km; otherwise the occasion is missing
                (NaN), not a miss (0)
  * covariates: FRP = max VIIRS FRP in the cluster (MODIS if no VIIRS);
                per-platform pixel area = mean area of its pixels in the cluster,
                or, if it missed the fire, the median area of that platform's
                detections within 50 km in the same window

Output: data/interim/fires/fires_<REGION>_<YEAR>_eps<EPS>.parquet
Usage:  python s1_match.py REGION YEAR [EPS_KM [MONTH ...]]
"""
import sys
import time

import duckdb
import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.neighbors import BallTree

from config import DETECTIONS_DIR, INTERIM_DIR

EARTH_R_KM = 6371.0
OVERPASS_GAP_MIN = 10
COVER_KM = 300
IMPUTE_KM = 50
WINDOWS = {"PM": (12.5, 15.5), "NIGHT": (0.5, 3.5)}
import os
# FIRECENSUS_P4=1 adds NOAA-21 (data from 2023-03) as a 4th capture occasion.
P4 = os.environ.get("FIRECENSUS_P4") == "1"
CAPTURE_PLATFORMS = ["Aqua", "SNPP", "NOAA20"] + (["NOAA21"] if P4 else [])
VIIRS = {"SNPP", "NOAA20", "NOAA21"}
# FIRECENSUS_WINDOWS=PM restricts matching to the afternoon window (faster)
_W = os.environ.get("FIRECENSUS_WINDOWS")
if _W:
    WINDOWS = {k: v for k, v in WINDOWS.items() if k in _W.split(",")}

FIRES_DIR = INTERIM_DIR / "fires"


def load(region: str, year: int, months=None) -> pd.DataFrame:
    """Vegetation-fire detections. NRT rows have no `type`: they are kept unless they fall in a
    ~1 km cell where science-quality data flagged a volcano / static land / offshore source."""
    con = duckdb.connect()
    month_sql = f"AND month IN ({','.join(map(str, months))})" if months else ""
    plats = ",".join(f"'{p}'" for p in CAPTURE_PLATFORMS)
    det = f"read_parquet('{DETECTIONS_DIR.as_posix()}/*_{year}.parquet', union_by_name=true)"
    static = f"read_parquet('{DETECTIONS_DIR.as_posix()}/*_202[3-6].parquet', union_by_name=true)"
    df = con.execute(f"""
        WITH mask AS (SELECT DISTINCT round(lat, 2) mlat, round(lon, 2) mlon FROM {static}
                      WHERE region = '{region}' AND fire_type IN (1, 2, 3))
        SELECT platform, lat, lon, t_utc, lst_hours, lst_date, daynight,
               area_km2, frp_mw, conf_class, country
        FROM {det} d
        WHERE region = '{region}' AND platform IN ({plats}) {month_sql}
          AND (fire_type = 0 OR (fire_type IS NULL AND NOT EXISTS (
                SELECT 1 FROM mask WHERE mlat = round(d.lat, 2) AND mlon = round(d.lon, 2))))
    """).fetchdf()
    return df


def assign_windows(df: pd.DataFrame) -> pd.DataFrame:
    df["window"] = None
    for name, (lo, hi) in WINDOWS.items():
        df.loc[(df.lst_hours >= lo) & (df.lst_hours < hi), "window"] = name
    return df.dropna(subset=["window"]).reset_index(drop=True)


def assign_overpasses(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["platform", "t_utc"]).reset_index(drop=True)
    gap = df.groupby("platform")["t_utc"].diff().dt.total_seconds().div(60)
    new = gap.isna() | (gap > OVERPASS_GAP_MIN)
    df["overpass_id"] = new.cumsum().astype(np.int64)
    return df


def match_group(g: pd.DataFrame, eps_km: float) -> pd.DataFrame:
    """Cluster one (lst_date, window) group and build one row per fire."""
    rad = np.radians(g[["lat", "lon"]].to_numpy())
    labels = DBSCAN(eps=eps_km / EARTH_R_KM, min_samples=1, metric="haversine",
                    algorithm="ball_tree").fit_predict(rad)
    g = g.assign(cluster=labels)

    agg = g.groupby("cluster").agg(
        lat=("lat", "mean"), lon=("lon", "mean"),
        n_pix=("lat", "size"),
        t_first=("t_utc", "min"), t_last=("t_utc", "max"),
        country=("country", "first"),
    )
    agg["dt_min"] = (agg.t_last - agg.t_first).dt.total_seconds() / 60
    viirs_frp = g[g.platform.isin(VIIRS)].groupby("cluster")["frp_mw"].max()
    modis_frp = g[g.platform == "Aqua"].groupby("cluster")["frp_mw"].max()
    agg["frp_viirs_max"] = viirs_frp
    agg["frp_modis_max"] = modis_frp
    agg["frp"] = agg.frp_viirs_max.fillna(agg.frp_modis_max)

    fire_rad = np.radians(agg[["lat", "lon"]].to_numpy())
    for p in CAPTURE_PLATFORMS:
        gp = g[g.platform == p]
        seen = gp.groupby("cluster").size()
        agg[f"npix_{p}"] = seen.reindex(agg.index).fillna(0).astype(int)
        area_seen = gp.groupby("cluster")["area_km2"].mean()
        cap = (agg[f"npix_{p}"] > 0).astype(float)
        area = area_seen.reindex(agg.index)
        if len(gp):
            tree = BallTree(np.radians(gp[["lat", "lon"]].to_numpy()), metric="haversine")
            covered = tree.query_radius(fire_rad, r=COVER_KM / EARTH_R_KM, count_only=True) > 0
            cap[~covered] = np.nan
            # impute area for misses from the same platform's pixels within IMPUTE_KM
            miss = area.isna().to_numpy() & covered
            if miss.any():
                idx = tree.query_radius(fire_rad[miss], r=IMPUTE_KM / EARTH_R_KM)
                areas = gp["area_km2"].to_numpy()
                area.iloc[np.where(miss)[0]] = [np.median(areas[i]) if len(i) else np.nan
                                                for i in idx]
        else:
            cap[:] = np.nan
        agg[f"cap_{p}"] = cap
        agg[f"area_{p}"] = area
    return agg.drop(columns=["t_first", "t_last"]).reset_index(drop=True)


def main(region: str, year: int, eps_km: float = 1.5, months=None) -> None:
    t0 = time.time()
    df = load(region, year, months)
    df = assign_overpasses(assign_windows(df))
    out = []
    for (d, w), g in df.groupby(["lst_date", "window"], sort=True):
        fires = match_group(g, eps_km)
        fires.insert(0, "window", w)
        fires.insert(0, "lst_date", d)
        out.append(fires)
    fires = pd.concat(out, ignore_index=True)
    fires.insert(0, "region", region)
    fires["year"] = year
    FIRES_DIR.mkdir(parents=True, exist_ok=True)
    suffix = f"_m{months[0]}-{months[-1]}" if months else ""
    suffix += "_p4" if P4 else ""
    path = FIRES_DIR / f"fires_{region}_{year}_eps{eps_km}{suffix}.parquet"
    fires.to_parquet(path, index=False)
    print(f"{region} {year} eps={eps_km}: {len(df):,} detections -> {len(fires):,} fires "
          f"in {time.time() - t0:.0f} s -> {path.name}")


if __name__ == "__main__":
    months = [int(m) for m in sys.argv[4:]] or None
    main(sys.argv[1], int(sys.argv[2]), float(sys.argv[3]) if len(sys.argv) > 3 else 1.5, months)
