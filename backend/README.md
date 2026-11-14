# FireCensus API

FastAPI + DuckDB over the parquet files in `data/product/` (built by `pipeline/s4_product.py`).

## Run (Windows, from this folder)
```
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```
Interactive docs: http://127.0.0.1:8000/docs

## Endpoints
| Endpoint | Purpose | Example |
|---|---|---|
| `/health` | liveness | `/health` |
| `/meta` | countries, years, notes, source | `/meta` |
| `/cells` | map layer: N per cell for one month + historical median + anomaly (`res` 0.1/0.25/0.5) | `/cells?year=2019&month=9&bbox=95,-6,120,6` |
| `/timeseries` | monthly N vs raw counts per sensor (shows the 2012 jump) | `/timeseries?country=Indonesia&start=2010-01&end=2014-12` |
| `/calendar` | burning calendar (median/p25/p75 per month, critical months) | `/calendar?country=Thailand` |
| `/compare` | this month vs same month other years (percentile, status) | `/compare?year=2019&month=9&country=Indonesia` |
| `/export/timeseries.csv` | CSV download of the time series | `/export/timeseries.csv?country=Malaysia` |
| `/export/cells.csv` | CSV of cell × month counts (≤500k rows) | `/export/cells.csv?start=2019-08&end=2019-10&bbox=108,-4.5,119,4.5` |
| `/method/detection-curves` | P(detect) vs FRP per sensor + validation numbers | `/method/detection-curves` |
| `/cases` | curated story cases | `/cases` |

Region = `country=` **or** `bbox=minLon,minLat,maxLon,maxLat`. Dates `YYYY-MM`.
Country names use FIRMS spelling (`Brunei_Darussalam`, `Lao_PDR`); the web app maps them to display names.

Performance: first `/cells` call ~1–2 s (DuckDB warm-up), then ~50 ms. Tables are loaded into memory at start (~30 MB).
