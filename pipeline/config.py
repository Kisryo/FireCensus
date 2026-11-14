"""FireCensus pipeline configuration.

Raw FIRMS Standard Processing CSVs are organised as
    <RAW_ROOT>/<sensor folder>/<year>/<prefix>_<year>_<Country>.csv
Override the location with the FIRECENSUS_RAW environment variable.
"""
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

RAW_ROOT = Path(os.environ.get("FIRECENSUS_RAW", Path.home() / "Downloads"))

SENSOR_FOLDERS = {
    "MODIS": "MODIS",           # Terra + Aqua, 2000-2025
    "SNPP": "VIIRS S-NPP",      # Suomi NPP, 2012-2025
    "NOAA20": "VIIRS NOAA-20",  # NOAA-20 (JPSS-1), 2018-2025
}

DATA_DIR = PROJECT_ROOT / "data"
INTERIM_DIR = DATA_DIR / "interim"
PRODUCT_DIR = DATA_DIR / "product"
DETECTIONS_DIR = INTERIM_DIR / "detections"

# Countries in scope (as spelled in the FIRMS file names)
COUNTRIES = [
    "Australia", "Brunei_Darussalam", "Cambodia", "Indonesia",
    "Lao_PDR", "Malaysia", "Myanmar", "Thailand",
]

# Grid used for computation (degrees); the web app aggregates to DISPLAY_GRID
GRID = 0.1
DISPLAY_GRID = 0.25

# DuckDB resource limits (keep modest for laptops)
DUCKDB_MEMORY = os.environ.get("FIRECENSUS_DUCKDB_MEMORY", "2GB")
DUCKDB_THREADS = int(os.environ.get("FIRECENSUS_DUCKDB_THREADS", "2"))
