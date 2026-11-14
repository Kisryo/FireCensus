# Workflow (decided 2026-11-14)

| Folder | Role | GitHub |
|---|---|---|
| `D:\Hackerthon Project\FireCensus(private)` | **Main development folder from 2026-11-14 on.** Teammates work here. | `Alleyz15/FireCensus-private` (Private) |
| `D:\Hackerthon Project\FireCensus` | **Public submission repo.** Only filled at the end by `tools/sync_to_public.py`. | `Alleyz15/FireCensus` (Public) |

At submission time:
1. Commit and push everything in the private repo.
2. Run `python tools/sync_to_public.py`. It copies the public whitelist into `..\FireCensus` and prints what it copied and what it skipped.
3. In GitHub Desktop, open `FireCensus`, check the file list, then commit and publish it as **Public**.

Never copied to public:
- `docs/screens/web/` (browser tabs show personal accounts)
- `data/interim/`, which is too big; anyone can rebuild it with `pipeline/`
- `.spline` backups and the Spline prompt drafts
