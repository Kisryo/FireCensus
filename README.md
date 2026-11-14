# FireCensus

**Counting the fires every satellite missed.**
NASA Space Apps Challenge 2026 · *Harmonization of MODIS and VIIRS Hot Spots*

## The problem

MODIS (1 km pixels, 2000–) and VIIRS (375 m pixels, 2012–) see the same fires with different eyes. VIIRS finds many more small, low-power fires, so when the record moves from one sensor to the other, fire counts jump. In Indonesia the jump is **×4.4 in 2012**, but the fires didn't change, only the satellite. The usual fix is to convert one sensor into the other with a single ratio. That cannot work, because the gap depends on fire size, pixel size, cloud, region and season. It also cannot say anything about fires that *no* satellite saw.

## Our idea: count fires the way ecologists count animals

Ecologists estimate a population they can never fully observe by running several surveys and checking **who was seen by whom** (capture-recapture). FireCensus treats each satellite pass as one survey:

| Ecology | FireCensus |
|---|---|
| An animal | A fire: detections within 1.5 km in the same afternoon window (DBSCAN, haversine) |
| Survey occasions | Aqua MODIS, S-NPP VIIRS, NOAA-20 VIIRS (afternoon, 12:30–15:30 local solar time) |
| Capture history | e.g. (1,0,1) = seen by Aqua and NOAA-20, missed by S-NPP |
| Distance from observer | Pixel area $A = \text{scan} \times \text{track}$ (grows toward the swath edge) |
| Body size | Fire radiative power (FRP) |
| Observer absent | No pass within 300 km: recorded as *missing*, not as a miss |

To our knowledge this is the first use of capture-recapture on MODIS/VIIRS active-fire data. No single satellite can estimate its own detection rate. Two satellites can act as each other's "marks", and three or more can also measure how correlated they are. **More satellites make the estimate better, not more confusing.**

## The model

**1 · Detection curves (Huggins conditional likelihood, a distance-sampling idea).** Each fire $i$ is detected by satellite $s$ with probability

```math
\mathrm{logit}\,p_{is} = \alpha_s + \beta_{1s}\log \mathrm{FRP}_i + \beta_{2s}\log A_{is}
```

The model is fitted only on fires seen at least once, so the unseen fires' covariates are never needed. This is a *data-learned observation operator*. Physics-based work (Sofiev & Kouznetsov 2026) finds the FRP detection limit grows linearly with pixel area, $D = \lambda A + \mu$, which is the same shape our curves learn. At nadir, MODIS needs about **19 MW** for a 50% chance of detection, while VIIRS needs about **5 MW**.

**2 · Total fires, seen and unseen (Horvitz–Thompson).** The chance a fire is seen by at least one satellite, and the population estimate, are

```math
p^{\ast}_{i} = 1-\prod_{s}\left(1-p_{is}\right), \qquad \hat N = \sum_{i\ \text{seen}} \frac{1}{p^{\ast}_{i}}
```

A small fire that is easy to miss counts for more: if it was seen once, there are probably others like it that were not. Weights are capped at 20 ($p^{\ast} \ge 0.05$). A Poisson log-linear multiple-systems model, with interactions for correlated sensors, gives an independent cross-check of $\hat N$.

**3 · Back to 2002, when only MODIS flew.** Each Aqua fire is weighted by its own detection probability. A residual factor $R$ then restores the fires MODIS can never see. $R$ is learned from the 2012–2021 overlap for each sub-region (maritime or mainland) and calendar month:

```math
\hat N_{g,t} = R_{g,m}\sum_{i \in \text{Aqua}(g,t)} \frac{1}{p_{i,\text{Aqua}}}, \qquad R_{g,m} = \frac{\sum 1/p^{\ast}_{i}}{\sum 1/p_{i,\text{Aqua}}}\Bigg|_{\text{2012-2021}}
```

The result is one **VIIRS-equivalent fire count** for every 0.1° cell and month, 2002 to Nov 2026, whichever satellites happened to be flying.

## Does it work?

| Test | Result |
|---|---|
| Remove one satellite (2023–25, 4-sensor model) | Raw counts change 15–25%; **FireCensus changes 0–6%** |
| 2011 → 2012 sensor switch, Indonesia | Naive "best sensor" ×4.4 jump; **FireCensus 363k → 349k** |
| Leave-one-year-out back-cast (240 region-months) | **12.5%** median error vs 14.0% for the ratio method (5.6% vs 7.5% in peak months) |
| A real satellite retirement | S-NPP stopped on 2 Nov 2026. Its passes become *missing* and estimation continues on Aqua + NOAA-20 |
| A 4th sensor | FRP for 50% detection: S-NPP 14.8, NOAA-20 15.1, NOAA-21 13.1 MW. The VIIRS units are interchangeable |
| Control region (Australia, Black Summer) | Hot, large fires get a small correction (1.06–1.27×) vs Borneo peat (1.24–1.64×). The method doesn't just inflate everything |
| Model-free check | Burning calendars match raw VIIRS peak months (Thailand Feb–Apr, Indonesia Aug–Oct) |

**Honest limits.**
- Fires appear and fade within the 3-hour window. The estimand is defined as *fires burning during the window*, and we measured how recapture falls as the time gap between passes grows.
- Unmodeled differences between fires make $\hat N$ conservative.
- Single 0.1° cells before 2012 are noisy (each Aqua fire stands for about 13). Regional totals are what was validated.
- Aug–Nov 2026 uses near-real-time data.

## What the website does

- **Story:** a 3D globe explains the idea in five scrolls.
- **Explore:** pick an area (case, country, typed or drawn box) and dates. See the burning calendar as a 3D skyline, a 2D calendar or a map. Switch between **FireCensus and raw MODIS/VIIRS** to watch the fake 2012 jump appear and disappear. Compare this month with the historical median (accessible viridis and RdBu colour ramps), find unusual months and the critical fire season, and download CSVs.
- **Cases:** Indonesia 2026 (live, with the S-NPP retirement), Borneo 2019, the 2015 haze, the MODIS-only 2006 season, mainland farm burning.

## Run it (Windows)

1. `backend\start_backend.bat` starts the API at http://127.0.0.1:8000/docs
2. `web\start_web.bat` starts the website at http://localhost:3000

Requirements: Python 3.10+ and Node.js LTS. Code: `pipeline/` (data processing), `backend/` (FastAPI + DuckDB), `web/` (Next.js, react-three-fiber, Spline).

## Read more

- **[docs/research.md](docs/research.md)**: background, design decisions, alternatives considered
- **[docs/findings-log.md](docs/findings-log.md)**: every result, validation run and caveat, in order
- **[docs/credits.md](docs/credits.md)**: data sources and full citations

## Credits

Fire data: NASA FIRMS, MODIS C6.1 and VIIRS 375 m (Giglio et al. 2016; Schroeder et al. 2014). We acknowledge the use of data from LANCE FIRMS, operated by NASA's Earth Science Data and Information System (ESDIS). Imagery: NASA Blue Marble. Satellite models: NASA 3D Resources. Basemap: Natural Earth.

> With the Local Lead's approval, part of this project was developed before the event weekend. The commit history shows the real dates.
