"""Step 0b - ingest FIRMS *custom Archive Download* requests (FIRMS 2026 folder).

These requests (firms.modaps.eosdis.nasa.gov/download) differ from the country-year files:
  * folder names carry no country -> we classify each request by its bounding box (manifest)
  * VIIRS uses MODIS-style column names (brightness / bright_t31)
  * each request has an `archive` file (science quality, with `type`) and an `nrt` file
    (near-real-time, version "...NRT", NO `type` column -> fire_type NULL, source='NRT')
Covers: 2026-01-01..2026-11-13 for MODIS / S-NPP (ends 2026-11-02) / NOAA-20 / NOAA-21,
and NOAA-21 2023-03-01..2025-12-31 (archive), for the 7 SEA countries.

Output: data/interim/detections/<SENSOR>_<YEAR>.parquet with the same columns as s0_ingest
plus `source` (SP | NRT). Existing files are never overwritten.
Usage:  python s0b_ingest_custom.py manifest      -> writes data/raw_manifest/firms_custom.csv
        python s0b_ingest_custom.py SENSOR YEAR    -> one file, e.g. NOAA21 2024
"""
import glob
import os
import sys
import time

import duckdb
import pandas as pd

from config import DETECTIONS_DIR, DUCKDB_MEMORY, DUCKDB_THREADS

CUSTOM_ROOT = os.environ.get("FIRECENSUS_CUSTOM", os.path.expanduser("~/Downloads/FIRMS 2026"))
MANIFEST = DETECTIONS_DIR.parents[1] / "raw_manifest" / "firms_custom.csv"
CODES = {"M-C61": "MODIS", "SV-C2": "SNPP", "J1V-C2": "NOAA20", "J2V-C2": "NOAA21"}


def classify(la0, la1, lo0, lo1):
    if la0 < -12: return "Australia"
    if lo1 > 130: return "Indonesia"
    if la1 < 8 and lo1 > 118: return "Malaysia"
    if lo0 > 113.9 and lo1 < 115.5: return "Brunei_Darussalam"
    if la1 > 26: return "Myanmar"
    if la0 > 13.5 and lo0 > 99.9: return "Lao_PDR"
    if la1 < 15 and lo0 > 102: return "Cambodia"
    return "Thailand"


def build_manifest():
    rows = []
    for d in sorted(glob.glob(os.path.join(CUSTOM_ROOT, "DL_FIRE_*"))):
        sensor = CODES[os.path.basename(d).split("_")[2]]
        for f in glob.glob(os.path.join(d, "*.csv")):
            df = pd.read_csv(f, usecols=["latitude", "longitude", "acq_date"])
            if not len(df):
                continue
            rows.append(dict(file=os.path.relpath(f, CUSTOM_ROOT), folder=os.path.basename(d), sensor=sensor,
                             kind="NRT" if "fire_nrt" in f else "SP", n=len(df),
                             date_from=df.acq_date.min(), date_to=df.acq_date.max(),
                             lat0=df.latitude.min(), lat1=df.latitude.max(),
                             lon0=df.longitude.min(), lon1=df.longitude.max()))
    m = pd.DataFrame(rows)
    # classify per request folder (archive + nrt together)
    box = m.groupby("folder").agg(la0=("lat0", "min"), la1=("lat1", "max"), lo0=("lon0", "min"), lo1=("lon1", "max"))
    box["country"] = [classify(*r) for r in box.itertuples(index=False)]
    m = m.merge(box["country"], left_on="folder", right_index=True)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    m.to_csv(MANIFEST, index=False)
    print(m.groupby(["country", "sensor"]).n.sum().unstack().fillna(0).astype(int).to_string())


def ingest(sensor: str, year: int):
    m = pd.read_csv(MANIFEST)
    m = m[(m.sensor == sensor) & (m.country != "Australia")]
    out = DETECTIONS_DIR / f"{sensor}_{year}.parquet"
    if out.exists():
        print(f"{out.name} exists, skipped"); return
    selects = []
    for r in m.itertuples():
        path = os.path.join(CUSTOM_ROOT, r.file).replace("\\", "/").replace("'", "''")
        ftype = "CAST(type AS INTEGER)" if r.kind == "SP" else "CAST(NULL AS INTEGER)"
        conf = ("CASE WHEN TRY_CAST(confidence AS INTEGER) < 30 THEN 'low' WHEN TRY_CAST(confidence AS INTEGER) < 80 "
                "THEN 'nominal' ELSE 'high' END") if sensor == "MODIS" else \
               ("CASE lower(confidence) WHEN 'l' THEN 'low' WHEN 'n' THEN 'nominal' WHEN 'h' THEN 'high' "
                "ELSE 'nominal' END")
        selects.append(f"""
        SELECT CASE WHEN satellite IN ('Terra','T') THEN 'Terra' WHEN satellite IN ('Aqua','A') THEN 'Aqua'
                    WHEN satellite IN ('N','SNPP','NPP') THEN 'SNPP' WHEN satellite IN ('N20','NOAA20','J1') THEN 'NOAA20'
                    WHEN satellite IN ('N21','NOAA21','J2') THEN 'NOAA21' ELSE satellite END AS platform,
               CASE WHEN satellite IN ('Terra','Aqua','T','A') THEN 'MODIS' ELSE 'VIIRS' END AS instrument,
               '{r.country}' AS country,
               CAST(latitude AS DOUBLE) lat, CAST(longitude AS DOUBLE) lon,
               CAST(acq_date AS DATE) + to_minutes(CAST(substr(lpad(acq_time,4,'0'),1,2) AS INTEGER)*60
                                                   + CAST(substr(lpad(acq_time,4,'0'),3,2) AS INTEGER)) AS t_utc,
               upper(daynight) daynight, CAST(scan AS DOUBLE) scan_km, CAST(track AS DOUBLE) track_km,
               CAST(frp AS DOUBLE) frp_mw, CAST(brightness AS DOUBLE) bt_mir, CAST(bright_t31 AS DOUBLE) bt_tir,
               CAST(confidence AS VARCHAR) conf_raw, {conf} conf_class, {ftype} AS fire_type,
               '{r.kind}' AS source
        FROM read_csv('{path}', all_varchar=true, header=true)""")
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{DUCKDB_MEMORY}'; SET threads={DUCKDB_THREADS};")
    part = out.with_suffix(".parquet.part")
    t0 = time.time()
    con.execute(f"""
    COPY (
      SELECT *, 'SEA' AS region, year(t_utc) AS year, month(t_utc) AS month, scan_km*track_km AS area_km2,
             ((hour(t_utc) + minute(t_utc)/60.0 + lon/15.0) % 24 + 24) % 24 AS lst_hours,
             CAST(t_utc + to_minutes(CAST(round(lon*4) AS INTEGER)) AS DATE) AS lst_date
      FROM ({' UNION ALL '.join(selects)})
      WHERE year(t_utc) = {year}
      ORDER BY platform, t_utc
    ) TO '{part.as_posix()}' (FORMAT parquet, COMPRESSION zstd)""")
    os.replace(part, out)
    n, nrt = con.execute(f"SELECT count(*), sum(CASE WHEN source='NRT' THEN 1 ELSE 0 END) FROM '{out.as_posix()}'").fetchone()
    print(f"{sensor} {year}: {n:,} rows ({nrt:,} NRT) in {time.time()-t0:.0f} s", flush=True)


if __name__ == "__main__":
    if sys.argv[1] == "manifest":
        build_manifest()
    else:
        ingest(sys.argv[1], int(sys.argv[2]))
