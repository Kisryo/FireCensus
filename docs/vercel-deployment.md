# Vercel services deployment

Use the repository root as the Vercel project root. The root `vercel.json`
defines exactly two services: `web` (Next.js) and `backend` (FastAPI).

## Request flow

Browser -> `/api/<endpoint>` on `web` -> runtime `BACKEND_URL` binding -> `backend`.
All other public paths also enter `web`. The backend has no public rewrite.
The proxy exposes only the read-only application endpoints and CSV downloads;
FastAPI admin/documentation paths are not exposed by the proxy.
`/api/cells/years` becomes `/cells/years` internally, and query strings survive.

Vercel must generate `BACKEND_URL`; never set it yourself in project settings,
`.env`, client bundles, build commands, or middleware. Remove any old production
`NEXT_PUBLIC_API_URL` pointing to localhost; leave it unset or use `/api`.
For standalone local servers, the Next.js proxy falls back to port 8000.

## Data packaging

The backend build runs `python prepare_data.py` from `backend/`. It copies the
four product tables, two model JSON files, and 2026 fire weights from the repository
into ignored `backend/.vercel-data/`. Missing inputs fail the build. This is about
57 MiB before Python dependencies; raw detections and 3D assets are not backend
runtime inputs. `app.py` uses this bundle when present, or the repository data
when developing without it. `FIRECENSUS_ROOT` remains an explicit override.

The historical `fires_weighted_SEA_PM.parquet` is not tracked in this repository.
This configuration preserves the current repository's 2026-only individual-fire
coverage; aggregate historical tables remain available. Restoring historical
individual-fire coverage requires a separate data packaging/storage decision.

## Validation

From the repository root:

```sh
python3 backend/prepare_data.py
npx vercel dev --local --listen 3100
```

Vercel injects the service binding for this local test. Check `/api/health`,
`/api/meta`, `/api/cells/years`, `/api/fires`, and CSV downloads on port 3100.
For frontend build validation, run `npm run build` in `web/`.

Confirm service names, public routing, and the binding before pushing or deploying.
