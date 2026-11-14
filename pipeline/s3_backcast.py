"""Model 3 - back-cast the MODIS-only era (research.md section 6).

Idea: in the overlap years we can count fires two ways.
  full   : every fire seen by any of Aqua / S-NPP / NOAA-20, weighted 1 / p*_i
           (p*_i = probability that at least one available satellite sees it)
  aqua   : only fires Aqua saw, weighted 1 / p_Aqua,i  (what is possible before 2012)
The ratio R = sum(full) / sum(aqua) per subregion x month-of-year captures what
Aqua can never see (fires below its detection range, fires in its swath gaps).
Before 2012:  N = sum over Aqua fires of (1 / p_Aqua,i) * R.

Every quantity uses MODIS-scale information only where the back-cast will:
FRP for Aqua's curve is MODIS FRP mapped to the VIIRS scale (fitted on fires
both saw), so the curve is applied the same way before and after 2012.

Validation (E2, leave-one-year-out over 2012-2021): predict each year's
monthly totals from Aqua alone and compare with the full estimate, against the
mainstream baseline "Aqua count x historical VIIRS/MODIS ratio".

Outputs
  data/interim/models/backcast_SEA_PM.json   coefficients, R, FRP map, validation
  data/product/fires_weighted_SEA_PM.parquet one row per fire with its weight
"""
import json
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from scipy.special import expit

import s2_models as m
from config import PRODUCT_DIR

REGION = "SEA"
OVERLAP_FIT = range(2012, 2022)      # Aqua not yet drifting; used to fit the curves
ALL_YEARS = range(2002, 2026)
P_FLOOR = 0.05                       # weight cap 1/0.05 = 20 (standard HT trimming)
SAMPLE_FRAC = 0.15
MARITIME = {"Indonesia", "Malaysia", "Brunei_Darussalam"}
COLS = ["lst_date", "window", "lat", "lon", "country", "frp", "frp_viirs_max",
        "frp_modis_max", "cap_Aqua", "cap_SNPP", "cap_NOAA20",
        "area_Aqua", "area_SNPP", "area_NOAA20"]


def read_year(y: int) -> pd.DataFrame:
    f = pd.read_parquet(m.FIRES_DIR / f"fires_{REGION}_{y}_eps1.5.parquet", columns=COLS)
    f = f[f.window == "PM"].copy()
    f["window"] = "PM"
    f["year"] = y
    f["month"] = pd.to_datetime(f.lst_date).dt.month
    f["subregion"] = np.where(f.country.isin(MARITIME), "maritime", "mainland")
    return f


def fit_frp_map(sample: pd.DataFrame):
    both = sample.dropna(subset=["frp_viirs_max", "frp_modis_max"])
    x, yv = np.log(both.frp_modis_max.clip(lower=0.5)), np.log(both.frp_viirs_max.clip(lower=0.5))
    b, a = np.polyfit(x, yv, 1)
    return float(a), float(b)


def apply_frp(f: pd.DataFrame, a: float, b: float) -> pd.DataFrame:
    f = f.copy()
    modis_equiv = np.exp(a + b * np.log(f.frp_modis_max.clip(lower=0.5)))
    f["frp_aqua_scale"] = modis_equiv                         # what Aqua alone would give
    f["frp"] = f.frp_viirs_max.fillna(modis_equiv)            # best available, VIIRS scale
    return f


def weights(f: pd.DataFrame, coefs: dict) -> pd.DataFrame:
    f = m.prepare(f)
    P, avail = m.detection_probs(f, coefs)
    pstar = 1 - np.prod(np.where(avail, 1 - P, 1.0), axis=1)
    f["w_full"] = 1 / np.clip(pstar, P_FLOOR, 1)
    c = coefs["Aqua"]
    eta = (c["intercept"] + c["log_frp"] * np.log(f.frp_aqua_scale.clip(lower=0.5))
           + c["log_area"] * f["log_area_Aqua"])
    f["p_aqua"] = expit(eta)
    f["w_aqua"] = np.where(f.cap_Aqua == 1, 1 / np.clip(f.p_aqua, P_FLOOR, 1), 0.0)
    return f


def monthly(f: pd.DataFrame) -> pd.DataFrame:
    return f.groupby(["year", "month", "subregion"]).agg(
        full=("w_full", "sum"), aqua_w=("w_aqua", "sum"),
        aqua_raw=("cap_Aqua", lambda s: (s == 1).sum()), n_obs=("w_full", "size")).reset_index()


def ratio_table(mo: pd.DataFrame, exclude=None) -> pd.DataFrame:
    d = mo if exclude is None else mo[mo.year != exclude]
    g = d.groupby(["subregion", "month"])[["full", "aqua_w", "aqua_raw"]].sum()
    return pd.DataFrame({"R": g.full / g.aqua_w, "ratio_raw": g.full / g.aqua_raw})


WEIGHTS_DIR = m.MODELS_DIR.parent / "weights"
FIT_PATH = m.MODELS_DIR / "backcast_fit_SEA_PM.json"


def step_fit():
    sample = pd.concat([read_year(y).sample(frac=SAMPLE_FRAC, random_state=y) for y in OVERLAP_FIT])
    a, b = fit_frp_map(sample)
    sample = apply_frp(sample, a, b)
    res, coefs, ses = m.huggins_fit(m.prepare(sample))
    print("FRP map: log FRP_viirs = %.3f + %.3f log FRP_modis" % (a, b))
    print("n sample", len(sample), "converged", bool(res.success))
    for p in coefs:
        print(p, {k: round(v, 3) for k, v in coefs[p].items()})
    FIT_PATH.write_text(json.dumps(dict(frp_map=dict(a=a, b=b), coefs=coefs, se=ses), indent=2, default=float))


def step_weights(years):
    fit = json.loads(FIT_PATH.read_text())
    a, b, coefs = fit["frp_map"]["a"], fit["frp_map"]["b"], fit["coefs"]
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    keep = ["year", "month", "lst_date", "subregion", "country", "lat", "lon", "frp", "cap_Aqua",
            "cap_SNPP", "cap_NOAA20", "w_full", "w_aqua"]
    for y in years:
        out = WEIGHTS_DIR / f"w_SEA_{y}_PM.parquet"
        if out.exists():
            continue
        f = weights(apply_frp(read_year(y), a, b), coefs)
        f[keep].to_parquet(out, index=False)
        print(y, len(f), "fires")


def step_final():
    def wy(y, cols=None):
        return pd.read_parquet(WEIGHTS_DIR / f"w_SEA_{y}_PM.parquet", columns=cols)
    mcols = ["year", "month", "subregion", "cap_Aqua", "w_full", "w_aqua"]
    mo = pd.concat([monthly(wy(y, mcols)) for y in ALL_YEARS], ignore_index=True)
    overlap = mo[mo.year.isin(OVERLAP_FIT)]

    val = []
    for y in OVERLAP_FIT:
        r = ratio_table(overlap, exclude=y)
        t = overlap[overlap.year == y].join(r, on=["subregion", "month"])
        t["pred_firecensus"] = t.aqua_w * t.R
        t["pred_ratio"] = t.aqua_raw * t.ratio_raw
        val.append(t)
    val = pd.concat(val)
    val = val[val.full > 200]
    err = lambda col: float(np.median(np.abs(val[col] / val.full - 1)) * 100)
    corr = lambda col: float(np.corrcoef(np.log(val[col]), np.log(val.full))[0, 1])
    summary = {
        "months_evaluated": int(len(val)),
        "median_abs_error_pct": {"firecensus": round(err("pred_firecensus"), 1),
                                 "ratio_baseline": round(err("pred_ratio"), 1)},
        "log_correlation": {"firecensus": round(corr("pred_firecensus"), 3),
                            "ratio_baseline": round(corr("pred_ratio"), 3)},
    }
    # peak-month test: the hardest months (top 10% by true count)
    top = val[val.full >= val.full.quantile(0.9)]
    summary["peak_months_median_abs_error_pct"] = {
        "firecensus": round(float(np.median(np.abs(top.pred_firecensus / top.full - 1)) * 100), 1),
        "ratio_baseline": round(float(np.median(np.abs(top.pred_ratio / top.full - 1)) * 100), 1)}
    print("E2 leave-one-year-out:", json.dumps(summary))

    R = ratio_table(overlap)
    import pyarrow as pa, pyarrow.parquet as pq
    PRODUCT_DIR.mkdir(parents=True, exist_ok=True)
    writer, yearly = None, []
    for y in ALL_YEARS:
        f = wy(y).join(R["R"], on=["subregion", "month"])
        f["era"] = "modis_only" if y < 2012 else "overlap"
        f["w_final"] = f.w_aqua * f.R if y < 2012 else f.w_full
        f = f.drop(columns=["R"])
        f["lst_date"] = pd.to_datetime(f.lst_date)
        yearly.append(f.groupby(["year", "subregion"]).agg(
            N_hat=("w_final", "sum"), aqua_raw=("cap_Aqua", lambda s: (s == 1).sum()),
            observed=("w_final", "size")).reset_index())
        t = pa.Table.from_pandas(f, preserve_index=False)
        if writer is None:
            writer = pq.ParquetWriter(PRODUCT_DIR / "fires_weighted_SEA_PM.parquet", t.schema)
        writer.write_table(t.cast(writer.schema))
        del f, t
    writer.close()
    yearly = pd.concat(yearly, ignore_index=True)
    yearly["x_aqua"] = (yearly.N_hat / yearly.aqua_raw).round(2)
    print(yearly.round(0).to_string(index=False))
    print(R.round(2).to_string())

    fit = json.loads(FIT_PATH.read_text())
    out = dict(fit, R=R.reset_index().round(3).to_dict(orient="records"),
               validation_E2=summary, yearly=yearly.round(1).to_dict(orient="records"))
    (m.MODELS_DIR / "backcast_SEA_PM.json").write_text(json.dumps(out, indent=2, default=float))


if __name__ == "__main__":
    import sys
    cmd = sys.argv[1]
    if cmd == "fit":
        step_fit()
    elif cmd == "weights":
        step_weights([int(y) for y in sys.argv[2:]] or ALL_YEARS)
    elif cmd == "final":
        step_final()
