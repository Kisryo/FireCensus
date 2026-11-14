# FireCensus web app (Next.js 15)

Pages: `/` story (Spline globe) · `/explore` analysis (3D skyline, 2D calendar, map, CSV) · `/cases` · `/method`

## Run locally (Windows)
1. Start the API: double-click `backend\start_backend.bat` (http://127.0.0.1:8000).
2. Double-click `web\start_web.bat`. The first run installs packages (~1–2 min).
3. Open http://localhost:3000

The API address is set in `.env.local` (`NEXT_PUBLIC_API_URL`). Copy `.env.example` if it is missing.

## Notes
- Map basemap: Natural Earth 1:50m country outlines (public domain), bundled in `public/sea-countries.geojson`, so no tile server is needed.
- MapLibre's worker is served from `public/maplibre/`.
- If the Spline scene can't load, the story falls back to a static background.
