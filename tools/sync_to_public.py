"""Copy the public subset of FireCensus(private) into ../FireCensus (the public repo).

Run from the FireCensus(private) folder:  python tools/sync_to_public.py
Only copies files that are new or changed; never deletes anything in the public folder.
"""
import filecmp
import os
import shutil

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(os.path.dirname(HERE), "FireCensus")

INCLUDE_DIRS = ["pipeline", "backend", "web", "assets", "data/product", "docs"]
INCLUDE_FILES = ["README.md", "requirements.txt", "FireCensusScene.jsx"]
EXCLUDE = ["docs/screens/web", "docs/prompt-", "docs/WORKFLOW.md", "__pycache__", ".pyc",
           "node_modules", ".next", ".env", "fires_weighted_", "start_backend.bat.bak"]


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
    stats = {"same": 0, "copied": [], "skipped": []}
    for d in INCLUDE_DIRS:
        for root, _, files in os.walk(os.path.join(HERE, d)):
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), HERE)
                (copy(rel, stats) if wanted(rel) else stats["skipped"].append(rel))
    for f in INCLUDE_FILES:
        if os.path.exists(os.path.join(HERE, f)):
            copy(f, stats)
    print(f"copied {len(stats['copied'])}, unchanged {stats['same']}, skipped {len(stats['skipped'])}")
    for r in stats["copied"]:
        print("  +", r)
    print("skipped (private only):")
    for r in sorted(set(os.path.dirname(s) or s for s in stats["skipped"])):
        print("  -", r)
    print(f"\nPublic folder: {PUBLIC}\n.gitignore there is kept as it is (public version).")


if __name__ == "__main__":
    main()
