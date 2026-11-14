"""Models 1 and 2 (research.md sections 4-5).

Model 2 - detection curves (Huggins conditional likelihood, "distance sampling"
          idea: pixel area plays the role of distance from the observer).
    logit p_is = a_s + b1_s * log(FRP_i) + b2_s * log(A_is)
    Likelihood uses only fires seen at least once:
        P(h_i | seen) = prod_s p_is^h p (1-p_is)^(1-h)  /  (1 - prod_s (1 - p_is))
    Occasions where the platform did not fly over (NaN) are left out of both
    products. Overlap-period total by Horvitz-Thompson: N = sum 1 / p*_i.

Model 1 - multiple-systems estimation (Poisson log-linear on capture-history
          counts) for strata where all three lists are available.

Estimand (decided 2026-11-08, see docs/findings-log.md): fires that burned at
some time during the capture window. Fire turnover between overpasses therefore
appears inside p (NOAA-20's p includes "still burning 25-50 min later") and in
the pairwise interaction terms of Model 1.
"""
import json
import sys

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.optimize import minimize
from scipy.special import expit

from config import INTERIM_DIR

import os
PLATFORMS = ["Aqua", "SNPP", "NOAA20"] + (["NOAA21"] if os.environ.get("FIRECENSUS_P4") == "1" else [])
FIRES_DIR = INTERIM_DIR / "fires"
MODELS_DIR = INTERIM_DIR / "models"


# ----------------------------------------------------------------- data prep
def prepare(f: pd.DataFrame) -> pd.DataFrame:
    f = f.copy()
    f["log_frp"] = np.log(f["frp"].clip(lower=0.5))
    for p in PLATFORMS:
        a = f[f"area_{p}"]
        # missing imputed area -> platform median for that day/window, then overall
        a = a.fillna(f.groupby(["lst_date", "window"])[f"area_{p}"].transform("median"))
        a = a.fillna(f[f"area_{p}"].median())
        f[f"log_area_{p}"] = np.log(a)
    return f


def design(f: pd.DataFrame):
    H = f[[f"cap_{p}" for p in PLATFORMS]].to_numpy()          # 1/0/NaN
    avail = ~np.isnan(H)
    H = np.nan_to_num(H)
    X = [np.column_stack([np.ones(len(f)), f["log_frp"], f[f"log_area_{p}"]])
         for p in PLATFORMS]
    return H, avail, X


# ------------------------------------------------------------------ model 2
def huggins_fit(f: pd.DataFrame):
    H, avail, X = design(f)
    k = X[0].shape[1]
    keep = (H * avail).sum(1) > 0
    H, avail, X = H[keep], avail[keep], [x[keep] for x in X]

    def unpack(theta):
        return [theta[i * k:(i + 1) * k] for i in range(len(PLATFORMS))]

    def nll(theta):
        betas = unpack(theta)
        logp = np.zeros(len(H)); log1mp_all = np.zeros(len(H)); grad = []
        P = []
        for s, b in enumerate(betas):
            p = np.clip(expit(X[s] @ b), 1e-9, 1 - 1e-9); P.append(p)
            a = avail[:, s]
            logp += a * (H[:, s] * np.log(p) + (1 - H[:, s]) * np.log1p(-p))
            log1mp_all += a * np.log1p(-p)
        q = np.exp(log1mp_all)                                  # P(missed by all)
        ll = logp - np.log1p(-q)
        for s, b in enumerate(betas):
            a = avail[:, s]; p = P[s]
            d_eta = a * (H[:, s] - p) - a * (q / (1 - q)) * p     # d ll / d eta_s
            grad.append(-(X[s] * d_eta[:, None]).sum(0))
        return -ll.sum(), np.concatenate(grad)

    theta0 = np.zeros(k * len(PLATFORMS))
    res = minimize(nll, theta0, jac=True, method="L-BFGS-B")
    # standard errors from numerical Hessian of the gradient
    eps = 1e-4; n = len(theta0); Hs = np.zeros((n, n))
    for j in range(n):
        e = np.zeros(n); e[j] = eps
        Hs[:, j] = (nll(res.x + e)[1] - nll(res.x - e)[1]) / (2 * eps)
    se = np.sqrt(np.diag(np.linalg.pinv((Hs + Hs.T) / 2)))
    coefs = {p: dict(zip(["intercept", "log_frp", "log_area"], res.x[i * k:(i + 1) * k].round(4)))
             for i, p in enumerate(PLATFORMS)}
    ses = {p: dict(zip(["intercept", "log_frp", "log_area"], se[i * k:(i + 1) * k].round(4)))
           for i, p in enumerate(PLATFORMS)}
    return res, coefs, ses


def detection_probs(f: pd.DataFrame, coefs: dict) -> np.ndarray:
    H, avail, X = design(f)
    P = np.column_stack([expit(X[s] @ np.array(list(coefs[p].values())))
                         for s, p in enumerate(PLATFORMS)])
    return P, avail


def horvitz_thompson(f: pd.DataFrame, coefs: dict) -> float:
    P, avail = detection_probs(f, coefs)
    H, _, _ = design(f)
    seen = (H * avail).sum(1) > 0
    pstar = 1 - np.prod(np.where(avail, 1 - P, 1.0), axis=1)
    return float((1 / pstar[seen]).sum()), pstar


def frp50(coefs: dict, platform: str, area_km2: float) -> float:
    c = coefs[platform]
    return float(np.exp(-(c["intercept"] + c["log_area"] * np.log(area_km2)) / c["log_frp"]))


# ------------------------------------------------------------------ model 1
def mse_loglinear(f: pd.DataFrame) -> pd.DataFrame:
    full = f.dropna(subset=[f"cap_{p}" for p in PLATFORMS])
    h = full[[f"cap_{p}" for p in PLATFORMS]].astype(int)
    counts = h.value_counts().rename("y").reset_index()
    counts.columns = ["a", "s", "n", "y"]
    counts = counts[(counts[["a", "s", "n"]].sum(1) > 0)]
    n_obs = int(counts.y.sum())
    specs = {
        "independent": "a + s + n",
        "VIIRS pair (s:n)": "a + s + n + s:n",
        "s:n + a:s": "a + s + n + s:n + a:s",
        "all pairs": "a + s + n + s:n + a:s + a:n",
    }
    rows = []
    for name, rhs in specs.items():
        m = sm.GLM.from_formula(f"y ~ {rhs}", data=counts, family=sm.families.Poisson()).fit()
        missed = float(np.exp(m.params["Intercept"]))
        rows.append(dict(model=name, n_observed=n_obs, n_missed_by_all=round(missed),
                         N_hat=round(n_obs + missed), aic=round(m.aic, 1) if m.df_resid > 0 else None))
    return pd.DataFrame(rows)


# --------------------------------------------------------------------- run
def run(region: str, year: int, eps: float = 1.5, window: str = "PM",
        box=None, months=None, tag="all"):
    f = pd.read_parquet(FIRES_DIR / f"fires_{region}_{year}_eps{eps}.parquet")
    f = f[f.window == window]
    if box:
        lon0, lon1, lat0, lat1 = box
        f = f[f.lon.between(lon0, lon1) & f.lat.between(lat0, lat1)]
    if months:
        f = f[pd.to_datetime(f.lst_date).dt.month.isin(months)]
    f = prepare(f)
    res, coefs, ses = huggins_fit(f)
    N_ht, _ = horvitz_thompson(f.dropna(subset=[f"cap_{p}" for p in PLATFORMS]), coefs)
    mse = mse_loglinear(f)
    out = dict(region=region, year=year, eps=eps, window=window, tag=tag,
               n_fires=int(len(f)), converged=bool(res.success),
               coefs=coefs, se=ses,
               frp50={p: {f"A={a}": round(frp50(coefs, p, a), 1) for a in (0.2, 0.5, 1.0, 2.0, 4.0)}
                      for p in PLATFORMS},
               N_ht_full_availability=round(N_ht),
               mse=mse.to_dict(orient="records"))
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    path = MODELS_DIR / f"models_{region}_{year}_{window}_eps{eps}_{tag}.json"
    path.write_text(json.dumps(out, indent=2, default=str))
    return out, mse


if __name__ == "__main__":
    region, year = sys.argv[1], int(sys.argv[2])
    eps = float(sys.argv[3]) if len(sys.argv) > 3 else 1.5
    out, mse = run(region, year, eps)
    print(json.dumps({k: out[k] for k in ("n_fires", "converged", "coefs", "frp50", "N_ht_full_availability")}, indent=1))
    print(mse.to_string(index=False))
