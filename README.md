# FireCensus

**Counting the fires every satellite missed.**
NASA Space Apps Challenge 2026 · *Harmonization of MODIS and VIIRS Hot Spots* · Johor Bahru (virtual)

FireCensus harmonizes MODIS and VIIRS active-fire detections for Southeast Asia (2002 to Nov 2026), so the satellite that saw a fire no longer changes the count.

It treats each satellite pass like a wildlife survey. **Capture-recapture statistics** from ecology estimate how many fires were burning during each afternoon window, including the fires no satellite detected.

---

## Key results

| Finding | Evidence |
|---|---|
| The sensor doesn't matter | Drop one sensor (2023–25): raw counts change 15–25%, FireCensus N changes **0–6%** |
| The fake 2012 jump is gone | Indonesia, using the "best available sensor": ×4.4 jump in 2012. FireCensus: 363k (2011) → 349k (2012) |
| Back-cast to 2002 works | Leave-one-year-out: **12.5%** median error vs 14.0% for the naive ratio method; 5.6% vs 7.5% in peak months |
| Satellite retirement handled | S-NPP stopped on **2 Nov 2026**. Its missing passes become NaN automatically, with no model change |
| VIIRS units are interchangeable | FRP at 50% detection: S-NPP 14.8, NOAA-20 15.1, NOAA-21 13.1 MW |
| Live case: Indonesia 2026 | Aug 2026 is 2.0× the 2003–25 median and the highest August of the VIIRS era. Raw pixel counts wrongly suggest up to 16× |

All numbers, decisions and caveats: **`docs/findings-log.md`**. Full method: **`docs/research.md`**.

---

## Quick start (Windows)

Requirements: Python 3.10+ and Node.js LTS.

1. **API**: double-click `backend\start_backend.bat`, then open http://127.0.0.1:8000/docs
2. **Website**: double-click `web\start_web.bat`. The first run installs and builds (~2–3 min). Then open http://localhost:3000
3. Keep both windows open.
4. After pulling new web code, delete `web\.next` before starting again so it rebuilds.

For the smoothest 3D, close other GPU-heavy apps while browsing the site.

---

## Repository layout

```
pipeline/   data processing, run in order (python <script> ...)
  config.py               paths and settings (raw FIRMS CSVs default to ~/Downloads)
  s0_ingest.py            FIRMS country-year CSVs -> data/interim/detections/<SENSOR>_<YEAR>.parquet
  s0b_ingest_custom.py    FIRMS custom downloads (2026 SP+NRT, NOAA-21) -> same format
  s1_match.py             afternoon/night windows, DBSCAN 1.5 km -> one row per fire + capture history
  s2_models.py            log-linear (MSE) and Huggins capture-recapture models
  s3_backcast.py          pooled fit 2012-21, weights, 2002-11 back-cast, E2 validation
  s3b_noaa21.py           NOAA-21 as 4th sensor + drop-one test   (FIRECENSUS_P4=1)
  s3c_2026.py             2026 on the historic model (S-NPP ends 2 Nov 2026)
  s4_product.py           website tables in data/product/
backend/    FastAPI + DuckDB over data/product (see backend/README.md)
web/        Next.js 15 site: / story, /explore, /cases, /method (see web/README.md)
docs/       research.md (method), findings-log.md (results), page-flow.md (UX),
            credits.md
assets/     NASA textures, satellite models and renders, fire points for the Spline scene
data/
  product/   4 tables the website uses (~35 MB, committed)
  interim/   detections, fires, weights, models (~2 GB, not included; rebuilt by pipeline/)
```

`data/product/fires_weighted_SEA_PM.parquet` (311 MB) is too big for GitHub. Rebuild it with
`cd pipeline && python s3_backcast.py final` (about 10 s), then `python s4_product.py`.

---

## Rebuilding the data from scratch

Raw data come from the NASA FIRMS Archive Download (MODIS C6.1, VIIRS 375 m S-NPP / NOAA-20 / NOAA-21) for Indonesia, Malaysia, Brunei, Thailand, Myanmar, Laos and Cambodia.

```
cd pipeline
python s0_ingest.py                      # country-year CSVs (2002-2025)
python s0b_ingest_custom.py manifest     # custom downloads (2026, NOAA-21)
python s0b_ingest_custom.py NOAA21 2023  # ... repeat per sensor-year
python s1_match.py SEA 2019              # per year (add months to split big years)
python s3_backcast.py fit && python s3_backcast.py weights && python s3_backcast.py final
python s3c_2026.py
python s4_product.py
```

Large years can be split by month (`python s1_match.py SEA 2023 1.5 1 2 3 4`). See `docs/findings-log.md` for exact runs.

---

## Website at a glance

| Page | What it does |
|---|---|
| `/` | Scroll story over the Spline globe (Welcome → Story_Scan → Story_Zoom → Story_Handoff) |
| `/explore` | Choose an area by case, country, typed box or drawn box, and a date range. Views: 3D skyline (Iso/Front/Side/Top, keys 1–4), 2D calendar, map. Sources: FireCensus / raw MODIS / raw VIIRS / raw best sensor. Cards: this month vs median, peaks, unusual months, critical period. CSV downloads |
| `/cases` | Indonesia 2026 (live), Borneo & Sumatra 2019, 2015 haze, 2006 MODIS-only, mainland March 2020 |
| `/method` | Capture histories, detection curves, validation table, limitations, citations |

Spline scene: `https://prod.spline.design/i6gXDIRfGjWXMnZA/scene.splinecode` (controlled with `setVariable("scene", …)`).

---

## Contributing

- Don't commit `node_modules/`, `.next/`, `.env*` or large data files. `.gitignore` handles these.
- Record any new result or decision in `docs/findings-log.md`.

---

## Credits

Fire data: NASA FIRMS. We acknowledge the use of data from LANCE FIRMS, operated by NASA's Earth Science Data and Information System (ESDIS).
Imagery: NASA Blue Marble Next Generation. Satellite models: NASA 3D Resources. Basemap: Natural Earth (public domain).
Full citations: `docs/credits.md`.

> Development note: with the Local Lead's approval, part of this project was developed before the event weekend. The commit history shows the real dates.
