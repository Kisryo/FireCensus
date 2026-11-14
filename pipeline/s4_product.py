"""Step 4 - website data product (research.md section 7: outputs).

Reads  data/product/fires_weighted_SEA_PM.parquet  (one row per fire, w_final)
Writes data/product/
  cells_month.parquet      0.1 deg cell x year x month: observed, harmonized N, burning days, FRP
  cells_clim.parquet       0.1 deg cell x month-of-year: median / p75 / max of N over 2003-2025 (absent years = 0)
  country_month.parquet    country x year x month: observed, harmonized N, raw counts per sensor
  country_calendar.parquet country x month-of-year: median / p25 / p75 of N (burning calendar)
2002 is excluded from climatologies (Aqua data start July 2002).
"""
import duckdb
from config import PRODUCT_DIR, DUCKDB_MEMORY, DUCKDB_THREADS

SRC = (PRODUCT_DIR / "fires_weighted_SEA_PM.parquet").as_posix()
CLIM_Y0, CLIM_Y1 = 2003, 2025
NY = CLIM_Y1 - CLIM_Y0 + 1  # 23


def main():
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{DUCKDB_MEMORY}'; SET threads={DUCKDB_THREADS}; SET preserve_insertion_order=false;")
    out = lambda name: (PRODUCT_DIR / name).as_posix()

    con.execute(f"""
    COPY (
      SELECT CAST(floor(lat*10) AS INTEGER) AS ci, CAST(floor(lon*10) AS INTEGER) AS cj,
             (floor(lat*10)+0.5)/10 AS lat_c, (floor(lon*10)+0.5)/10 AS lon_c,
             any_value(country) AS country, year, month, any_value(era) AS era,
             count(*) AS n_obs,
             sum(w_final) AS n_hat,
             count(DISTINCT lst_date) AS burning_days,
             sum(frp) AS frp_sum
      FROM read_parquet('{SRC}')
      GROUP BY ci, cj, lat_c, lon_c, year, month
    ) TO '{out("cells_month.parquet")}' (FORMAT parquet, COMPRESSION zstd)""")

    # median with absent years counted as zero: sorted list of k present values, NY-k implicit zeros
    con.execute(f"""
    COPY (
      WITH v AS (
        SELECT ci, cj, any_value(lat_c) lat_c, any_value(lon_c) lon_c, any_value(country) country, month,
               count(*) AS k, list_sort(list(n_hat)) AS vals, max(n_hat) AS n_max
        FROM read_parquet('{out("cells_month.parquet")}')
        WHERE year BETWEEN {CLIM_Y0} AND {CLIM_Y1}
        GROUP BY ci, cj, month)
      SELECT ci, cj, lat_c, lon_c, country, month, k AS years_burning,
             CASE WHEN {NY}-k >= 12 THEN 0 ELSE vals[12-({NY}-k)] END AS n_median,
             CASE WHEN {NY}-k >= 18 THEN 0 ELSE vals[18-({NY}-k)] END AS n_p75,
             n_max
      FROM v
    ) TO '{out("cells_clim.parquet")}' (FORMAT parquet, COMPRESSION zstd)""")

    con.execute(f"""
    COPY (
      SELECT country, year, month, any_value(era) era,
             count(*) AS n_obs, sum(w_final) AS n_hat,
             sum(CASE WHEN cap_Aqua=1 THEN 1 ELSE 0 END) AS aqua_raw,
             sum(CASE WHEN cap_SNPP=1 THEN 1 ELSE 0 END) AS snpp_raw,
             sum(CASE WHEN cap_NOAA20=1 THEN 1 ELSE 0 END) AS noaa20_raw
      FROM read_parquet('{SRC}')
      GROUP BY country, year, month
    ) TO '{out("country_month.parquet")}' (FORMAT parquet)""")

    # country calendar: fill missing year-months with 0 before taking quantiles
    con.execute(f"""
    COPY (
      WITH grid AS (
        SELECT c.country, y.year, m.month
        FROM (SELECT DISTINCT country FROM read_parquet('{out("country_month.parquet")}')) c,
             range({CLIM_Y0}, {CLIM_Y1}+1) y(year), range(1, 13) m(month)),
      f AS (
        SELECT g.country, g.month, g.year, coalesce(cm.n_hat, 0) AS n_hat
        FROM grid g LEFT JOIN read_parquet('{out("country_month.parquet")}') cm
          ON cm.country=g.country AND cm.year=g.year AND cm.month=g.month)
      SELECT country, month,
             quantile_cont(n_hat, 0.5) AS n_median,
             quantile_cont(n_hat, 0.25) AS n_p25,
             quantile_cont(n_hat, 0.75) AS n_p75,
             max(n_hat) AS n_max
      FROM f GROUP BY country, month ORDER BY country, month
    ) TO '{out("country_calendar.parquet")}' (FORMAT parquet)""")

    for name in ["cells_month", "cells_clim", "country_month", "country_calendar"]:
        n = con.execute(f"SELECT count(*) FROM read_parquet('{out(name + '.parquet')}')").fetchone()[0]
        print(f"{name}: {n:,} rows")


if __name__ == "__main__":
    main()
