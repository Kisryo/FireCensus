"""Copy only runtime data into the backend service before Vercel bundles it."""
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent
TARGET = HERE / ".vercel-data"
FILES = [
    "data/product/cells_month.parquet",
    "data/product/cells_clim.parquet",
    "data/product/country_month.parquet",
    "data/product/country_calendar.parquet",
    "data/interim/models/backcast_fit_SEA_PM.json",
    "data/interim/models/backcast_SEA_PM.json",
    "data/interim/weights/w_SEA_2026_PM.parquet",
]

if __name__ == "__main__":
    for name in FILES:
        source = SOURCE / name
        if not source.is_file():
            raise FileNotFoundError(f"Required runtime data is missing: {source}")
    for name in FILES:
        destination = TARGET / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SOURCE / name, destination)
    print(f"Prepared {len(FILES)} runtime files ({sum((TARGET / p).stat().st_size for p in FILES) / 1024**2:.1f} MiB)")
