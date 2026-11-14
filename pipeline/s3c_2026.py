"""Step 3c - 2026 harmonized counts on the SAME model as the 2002-2025 product.

Uses the historic 3-sensor model (backcast_fit_SEA_PM.json, fit on 2012-2021) on the 2026 fires
(matched with the p4 runs; the NOAA-21 column is simply ignored here). After S-NPP ends on
2026-11-02 its occasion is NaN, so only Aqua + NOAA-20 count. Drop-one tests on 2023-2025
showed that removing one sensor moves N by 0-6% (observed counts move 15-25%).
Output: data/interim/weights/w_SEA_2026_PM.parquet (same columns as the other years)
"""
import glob
import json
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
import s2_models as m
import s3_backcast as b

assert m.PLATFORMS == ["Aqua", "SNPP", "NOAA20"], "run WITHOUT FIRECENSUS_P4"
fit = json.loads((m.MODELS_DIR / "backcast_fit_SEA_PM.json").read_text())
fs = sorted(glob.glob(str(m.FIRES_DIR / "fires_SEA_2026_eps1.5_m*_p4.parquet")))
f = pd.concat([pd.read_parquet(x, columns=b.COLS) for x in fs], ignore_index=True)
f = f[f.window == "PM"].copy()
f["year"] = 2026
f["month"] = pd.to_datetime(f.lst_date).dt.month
f["subregion"] = np.where(f.country.isin(b.MARITIME), "maritime", "mainland")
# keep only fires seen by at least one of the three historic sensors (NOAA-21-only fires are not
# part of the historic capture design)
seen = f[["cap_Aqua", "cap_SNPP", "cap_NOAA20"]].fillna(0).sum(1) > 0
f = f[seen]
f = b.weights(b.apply_frp(f, fit["frp_map"]["a"], fit["frp_map"]["b"]), fit["coefs"])
f["era"] = "overlap"
f["w_final"] = f.w_full
f["lst_date"] = pd.to_datetime(f.lst_date)
keep = ["year", "month", "lst_date", "subregion", "country", "lat", "lon", "frp", "cap_Aqua",
        "cap_SNPP", "cap_NOAA20", "w_full", "w_aqua", "era", "w_final"]
out = m.MODELS_DIR.parent / "weights" / "w_SEA_2026_PM.parquet"
f[keep].to_parquet(out, index=False)
after = f[f.lst_date > "2026-11-02"]
print(f"2026: {len(f):,} fires, N = {f.w_final.sum():,.0f}; after Nov 2: {len(after):,} fires, "
      f"S-NPP occasion NaN in {after.cap_SNPP.isna().mean()*100:.0f}%")
print(f.groupby("month").w_final.sum().round(0).to_string())
