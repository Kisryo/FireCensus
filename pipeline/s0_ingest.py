"""Step 0 - ingest FIRMS CSVs into one unified, partitioned Parquet table.

Output: data/interim/detections/<SENSOR>_<YEAR>.parquet (one file per sensor-year)

Unified columns
  platform      Terra | Aqua | SNPP | NOAA20
  instrument    MODIS | VIIRS
  country       from the file name
  region        SEA | AUS
  lat, lon
  t_utc         acquisition timestamp (UTC)
  year, month   UTC calendar
  lst_hours     local solar time in hours (0-24), lon/15 approximation
  lst_date      local solar date
  daynight      D | N
  scan_km, track_km, area_km2   actual pixel footprint
  frp_mw        fire radiative power (MW)
  bt_mir, bt_tir  brightness temperatures (K): MODIS 4um/11um, VIIRS I4/I5
  conf_raw      original confidence (MODIS 0-100, VIIRS l/n/h)
  conf_class    low | nominal | high (common scale)
  fire_type     FIRMS type (0 vegetation, 1 volcano, 2 static land source, 3 offshore)
"""
import time

import duckdb

from config import (DETECTIONS_DIR, DUCKDB_MEMORY, DUCKDB_THREADS, RAW_ROOT,
                    SENSOR_FOLDERS)


def source_sql(folder: str, is_modis: bool) -> str:
    path = (RAW_ROOT / folder).as_posix() + "/*/*.csv"
    bt_mir = "brightness" if is_modis else "bright_ti4"
    bt_tir = "bright_t31" if is_modis else "bright_ti5"
    conf_class = (
        "CASE WHEN TRY_CAST(confidence AS INTEGER) < 30 THEN 'low' "
        "WHEN TRY_CAST(confidence AS INTEGER) < 80 THEN 'nominal' ELSE 'high' END"
        if is_modis else
        "CASE lower(confidence) WHEN 'l' THEN 'low' WHEN 'n' THEN 'nominal' "
        "WHEN 'h' THEN 'high' ELSE 'nominal' END"
    )
    return f"""
    SELECT
        CASE satellite WHEN 'Terra' THEN 'Terra' WHEN 'Aqua' THEN 'Aqua'
                       WHEN 'N' THEN 'SNPP' WHEN 'N20' THEN 'NOAA20'
                       ELSE satellite END                         AS platform,
        instrument,
        regexp_extract(filename, '_\\d{{4}}_(.+)\\.csv$', 1)       AS country,
        CAST(latitude AS DOUBLE)                                   AS lat,
        CAST(longitude AS DOUBLE)                                  AS lon,
        CAST(acq_date AS DATE)
          + to_minutes(CAST(substr(lpad(acq_time, 4, '0'), 1, 2) AS INTEGER) * 60
                       + CAST(substr(lpad(acq_time, 4, '0'), 3, 2) AS INTEGER)) AS t_utc,
        upper(daynight)                                            AS daynight,
        CAST(scan AS DOUBLE)                                       AS scan_km,
        CAST(track AS DOUBLE)                                      AS track_km,
        CAST(frp AS DOUBLE)                                        AS frp_mw,
        CAST({bt_mir} AS DOUBLE)                                   AS bt_mir,
        CAST({bt_tir} AS DOUBLE)                                   AS bt_tir,
        CAST(confidence AS VARCHAR)                                AS conf_raw,
        {conf_class}                                               AS conf_class,
        CAST(type AS INTEGER)                                      AS fire_type
    FROM read_csv('{path}', filename = true, union_by_name = true,
                  all_varchar = true, header = true)
    """


def ingest_one(con, sensor: str, year: int) -> int:
    """Ingest one sensor folder for one year into a single Parquet file."""
    folder = SENSOR_FOLDERS[sensor]
    src = RAW_ROOT / folder / str(year)
    if not src.exists():
        return 0
    out = DETECTIONS_DIR / f"{sensor}_{year}.parquet"
    part = out.with_suffix(".parquet.part")  # renamed only when complete
    sql = source_sql(folder, sensor == "MODIS").replace("/*/*.csv", f"/{year}/*.csv")
    con.execute(f"""
    COPY (
      SELECT *,
        CASE WHEN country = 'Australia' THEN 'AUS' ELSE 'SEA' END   AS region,
        year(t_utc)                                                 AS year,
        month(t_utc)                                                AS month,
        scan_km * track_km                                          AS area_km2,
        ((hour(t_utc) + minute(t_utc) / 60.0 + lon / 15.0) % 24 + 24) % 24 AS lst_hours,
        CAST(t_utc + to_minutes(CAST(round(lon * 4) AS INTEGER)) AS DATE)  AS lst_date
      FROM ({sql})
      ORDER BY platform, t_utc
    ) TO '{part.as_posix()}' (FORMAT parquet, COMPRESSION zstd)
    """)
    part.replace(out)
    return con.execute(f"SELECT count(*) FROM '{out.as_posix()}'").fetchone()[0]


def connect():
    tmp = DETECTIONS_DIR.parent / "_duckdb_tmp"
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{DUCKDB_MEMORY}'")
    con.execute(f"SET threads={DUCKDB_THREADS}")
    con.execute(f"SET temp_directory='{tmp.as_posix()}'")
    return con


def main() -> None:
    """Usage: python s0_ingest.py [SENSOR [YEAR ...]]   (default: everything)

    Each sensor-year becomes data/interim/detections/<SENSOR>_<YEAR>.parquet.
    Existing files are skipped, so the script can be re-run to resume.
    """
    import sys
    DETECTIONS_DIR.mkdir(parents=True, exist_ok=True)
    sensors = [sys.argv[1]] if len(sys.argv) > 1 else list(SENSOR_FOLDERS)
    years = [int(y) for y in sys.argv[2:]] or list(range(2000, 2026))
    con = connect()
    for sensor in sensors:
        for year in years:
            out = DETECTIONS_DIR / f"{sensor}_{year}.parquet"
            if out.exists():
                continue
            t0 = time.time()
            n = ingest_one(con, sensor, year)
            if n:
                print(f"{sensor} {year}: {n:,} rows in {time.time() - t0:.0f} s", flush=True)


def summary() -> None:
    con = connect()
    df = con.execute(f"""
        SELECT platform, region, count(*) AS n, min(year) AS y0, max(year) AS y1,
               round(100.0 * avg(CASE WHEN fire_type = 0 THEN 1 ELSE 0 END), 1) AS pct_veg
        FROM read_parquet('{DETECTIONS_DIR.as_posix()}/*.parquet')
        GROUP BY 1, 2 ORDER BY 1, 2
    """).fetchdf()
    print(df.to_string(index=False))


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "summary":
        summary()
    else:
        main()
