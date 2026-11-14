"""Step 3b - NOAA-21 as a 4th capture occasion + 2026 harmonized counts.

fit     : pooled Huggins model with Aqua, S-NPP, NOAA-20, NOAA-21 on SEA 2023-2025 (PM, 20% sample)
          -> data/interim/models/huggins_p4_SEA_PM.json ; compares NOAA-21 vs NOAA-20 curves
check   : N for 2023-2025 under the 4-sensor model vs the 3-sensor product (should agree:
          adding a sensor must not change the estimate, only tighten it)
y2026   : weights for 2026 (S-NPP ends 2026-11-02 -> its occasion is NaN afterwards, automatically)
          -> data/interim/weights/w_SEA_2026_PM_p4.parquet
Run with FIRECENSUS_P4=1.
"""
import glob
import json
import os
import sys
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
assert os.environ.get("FIRECENSUS_P4") == "1", "run with FIRECENSUS_P4=1"
import s2_models as m
import s3_backcast as b

FIT = m.MODELS_DIR / "huggins_p4_SEA_PM.json"
P = m.PLATFORMS
COLS = ["lst_date", "window", "lat", "lon", "country", "frp", "frp_viirs_max", "frp_modis_max"] + \
       [f"cap_{p}" for p in P] + [f"area_{p}" for p in P]


def read(y):
    fs = sorted(glob.glob(str(m.FIRES_DIR / f"fires_SEA_{y}_eps1.5_m*_p4.parquet")))
    f = pd.concat([pd.read_parquet(x, columns=COLS) for x in fs], ignore_index=True)
    f = f[f.window == "PM"].copy()
    f["year"] = y
    f["month"] = pd.to_datetime(f.lst_date).dt.month
    f["subregion"] = np.where(f.country.isin(b.MARITIME), "maritime", "mainland")
    return f


def step_fit():
    s = pd.concat([read(y).sample(frac=0.2, random_state=y) for y in (2023, 2024, 2025)])
    a, bb = b.fit_frp_map(s)
    s = b.apply_frp(s, a, bb)
    res, coefs, ses = m.huggins_fit(m.prepare(s))
    print("n =", len(s), "converged", bool(res.success))
    for p in P:
        print(f"  {p:7s}", {k: round(v, 3) for k, v in coefs[p].items()}, " se", {k: round(v, 3) for k, v in ses[p].items()})
    for p in P:
        print(f"  FRP at 50% detection, 0.2 km2 pixel ({p}): {m.frp50(coefs, p, 0.2):.1f} MW"
              if p != "Aqua" else f"  FRP at 50% detection, 1 km2 pixel (Aqua): {m.frp50(coefs, p, 1.0):.1f} MW")
    FIT.write_text(json.dumps(dict(frp_map=dict(a=a, b=bb), coefs=coefs, se=ses), indent=2, default=float))


def weights_for(y):
    fit = json.loads(FIT.read_text())
    f = b.apply_frp(read(y), fit["frp_map"]["a"], fit["frp_map"]["b"])
    f = m.prepare(f)
    Pm, avail = m.detection_probs(f, fit["coefs"])
    pstar = 1 - np.prod(np.where(avail, 1 - Pm, 1.0), axis=1)
    f["w_full"] = 1 / np.clip(pstar, b.P_FLOOR, 1)
    return f


def step_check():
    cm = pd.read_parquet(m.MODELS_DIR.parents[1] / "product" / "country_month.parquet")
    for y in (2023, 2024, 2025):
        f = weights_for(y)
        n4 = f.w_full.sum()
        n3 = cm[cm.year == y].n_hat.sum()
        print(f"{y}: N 3-sensor = {n3:,.0f}   N 4-sensor = {n4:,.0f}   ratio = {n4/n3:.3f}   observed = {len(f):,}")


def step_2026():
    f = weights_for(2026)
    f["era"] = "nrt_p4"
    f["w_final"] = f.w_full
    keep = ["year", "month", "lst_date", "subregion", "country", "lat", "lon", "frp"] + \
           [f"cap_{p}" for p in P] + ["w_full", "era", "w_final"]
    out = m.MODELS_DIR.parent / "weights" / "w_SEA_2026_PM_p4.parquet"
    f["lst_date"] = pd.to_datetime(f.lst_date)
    f[keep].to_parquet(out, index=False)
    snpp_after = f[(f.lst_date > "2026-11-02")].cap_SNPP
    print(f"2026: {len(f):,} fires, N = {f.w_full.sum():,.0f} -> {out.name}")
    print(f"  S-NPP occasion after 2026-11-02: {snpp_after.isna().mean()*100:.0f}% NaN (expected ~100%), n={len(snpp_after)}")


if __name__ == "__main__":
    {"fit": step_fit, "check": step_check, "y2026": step_2026}[sys.argv[1]]()
