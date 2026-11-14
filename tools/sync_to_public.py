"""Copy the public subset of FireCensus(private) into ../FireCensus (the public repo).

Run from the FireCensus(private) folder:  python tools/sync_to_public.py [TARGET_FOLDER]
(default target: ..\\FireCensus-public, the clone of the public GitHub repo)
Only copies files that are new or changed; never deletes anything in the public folder.
"""
import filecmp
import os
import shutil

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import sys
# Target folder: first argument, else ../FireCensus-public (clone of the public GitHub repo)
PUBLIC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), "FireCensus-public")

INCLUDE_DIRS = ["pipeline", "backend", "web", "assets", "data/product", "docs"]
INCLUDE_FILES = ["README.md", "requirements.txt", "FireCensusScene.jsx"]
PUBLIC_GITIGNORE = """# large data (rebuild with pipeline/; raw FIRMS CSVs are downloaded separately)
data/raw/
data/interim/
data/product/fires_weighted_*.parquet
*.part
# python
__pycache__/
*.pyc
.venv/
# node / next.js
node_modules/
.next/
.next_old*/
# secrets & local
.env
.env.local
.env.production
*.log
.DS_Store
Thumbs.db
"""
EXCLUDE = ["docs/screens/web", "docs/prompt-", "docs/WORKFLOW.md", "__pycache__", ".pyc",
           "node_modules", ".next", ".env.local", ".env.production", "fires_weighted_", "start_backend.bat.bak"]


def wanted(rel):
    rel = rel.replace("\\", "/")
    return not any(x in rel for x in EXCLUDE)


def copy(rel, stats):
    src, dst = os.path.join(HERE, rel), os.path.join(PUBLIC, rel)
    if os.path.exists(dst) and filecmp.cmp(src, dst, shallow=False):
        stats["same"] += 1
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    stats["copied"].append(rel)


def main():
    if not os.path.isdir(os.path.join(PUBLIC, ".git")):
        print(f"Target {PUBLIC} is not a git clone. Clone the public repo there first (GitHub Desktop: File > Clone repository).")
        return
    stats = {"same": 0, "copied": [], "skipped": []}
    for d in INCLUDE_DIRS:
        for root, _, files in os.walk(os.path.join(HERE, d)):
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), HERE)
                (copy(rel, stats) if wanted(rel) else stats["skipped"].append(rel))
    for f in INCLUDE_FILES:
        if os.path.exists(os.path.join(HERE, f)):
            copy(f, stats)
    gi = os.path.join(PUBLIC, ".gitignore")
    if not os.path.exists(gi) or open(gi).read() != PUBLIC_GITIGNORE:
        open(gi, "w").write(PUBLIC_GITIGNORE); stats["copied"].append(".gitignore")
    print(f"copied {len(stats['copied'])}, unchanged {stats['same']}, skipped {len(stats['skipped'])}")
    for r in stats["copied"]:
        print("  +", r)
    print("skipped (private only):")
    for r in sorted(set(os.path.dirname(s) or s for s in stats["skipped"])):
        print("  -", r)
    print(f"\nPublic folder: {PUBLIC}")


if __name__ == "__main__":
    main()
