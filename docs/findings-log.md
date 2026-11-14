# FireCensus 发现记录（findings log）

记录管线每一步跑出来的关键数字与决定，方便写方法页、简报和回答评审。

## 2026-11-08 · 步骤 ① 数据统一

- 48 个 Parquet（传感器 × 年），共约 6,100 万个火点，1.3 GB
- 2019 东南亚白天中位当地太阳时：Aqua 13:27，S-NPP 13:20，NOAA-20 13:21，Terra 10:40
- 2025：Aqua 已漂移到 14:23（比 VIIRS 晚约 1 小时），仍在 12:30–15:30 捕捉窗内
- 中位像素面积：MODIS 1.32 km²，VIIRS 0.19 km²；白天中位 FRP：VIIRS 5.8 MW，MODIS 21.1 MW
- 植被火（type = 0）占 95–99%

## 2026-11-08 · 步骤 ②③ 过境与配对（research.md 第 2–3 节规则，eps = 1.5 km）

- 东南亚 2019：293 万个窗口内火点 → 114 万场火；2025：149 万 → 61 万
- 覆盖率（300 km 规则）：Aqua 85.9%（低纬度扫描间隙），S-NPP 99.5%，NOAA-20 99.6%
- 婆罗洲 2019 年 8–10 月下午、三颗都有覆盖的 52,188 场火，捕获历史 (Aqua, S-NPP, NOAA-20)：
  010: 17,488 · 001: 17,131 · 011: 8,052 · 111: 3,719 · 100: 2,177 · 101: 1,847 · 110: 1,774
- **Aqua 侦测率随 FRP 单调上升**：≤2 MW 3% → 5–10 MW 14% → 20–50 MW 37% → >100 MW 54%。
  这就是模型二要学的侦测曲线，原始数据里已经清楚可见。S-NPP 同区间 49% → 73%。

### 重要发现：火在两次过境之间会「出现、熄灭」（封闭性假设不成立）

同一种仪器（S-NPP 与 NOAA-20）互相「再捕获」的比例很低，而且和过境时间差有关：

| 年份 | S-NPP 与 NOAA-20 时间差 | P(NOAA-20 看到 \| S-NPP 看到) |
| --- | --- | --- |
| 2019 | 约 50 分钟 | 32% |
| 2025 | 约 25 分钟 | 41% |

时间差减半，再捕获率明显上升 → 有相当比例的小火在几十分钟内就点燃或熄灭（生态学称「暂时迁出 / availability」）。
另外两颗卫星在同一地点的扫描角不同，像素大小不同，也会降低再捕获率（这部分由模型二的像素面积协变量处理）。

**决定（2026-11-08 已确认）：**
1. 估计目标定义为「捕捉窗（12:30–15:30）内曾经燃烧的火」，而不是「某一瞬间的火」
2. 模型二的侦测曲线优先用时间最接近的配对来学（2012–2021 年的 Aqua 与 S-NPP 几乎同时过境）
3. 模型一、二都加入「过境时间差」作为协变量 / 交互项，吸收火的周转
4. 这个发现本身写进方法页：它解释了为什么「简单比例校准」会系统性出错

## 2026-11-08 · 模型一、模型二（婆罗洲 2019 年 8–10 月，下午窗）

代码：`pipeline/s2_models.py`；结果：`data/interim/models/models_SEA_2019_PM_eps*_borneo_ASO.json`

### 模型二：侦测曲线（Huggins 条件似然，logit p = a + b1·log FRP + b2·log 像素面积）

| 卫星 | log FRP 系数 | log 像素面积系数 |
| --- | --- | --- |
| Aqua (MODIS) | +1.37 (±0.02) | −1.66 (±0.02) |
| S-NPP (VIIRS) | +0.71 (±0.01) | −1.28 (±0.03) |
| NOAA-20 (VIIRS) | +0.74 (±0.01) | −1.29 (±0.03) |

- 方向完全符合物理：火越强越容易看到；像素越大（离扫描正下方越远）越难看到
- Aqua 50% 侦测点：像素 1 km² 时 18.5 MW，4 km² 时 99.5 MW
- 对照 Sofiev 2026：MODIS 白天正下方侦测极限 5.7 MW、边缘（约 9–10 km²）约 42 MW。我们的 50% 点比 Sofiev 的晴空侦测极限高约 3 倍，
  原因是我们的 p 还包含云、烟和火的周转（Sofiev 的是晴空、瞬时的物理极限）。随像素面积上升的趋势一致。
- 两颗 VIIRS 的系数几乎相同（同一种仪器），符合预期，是内部一致性检查

### 模型一：多源估计（对数线性）与模型二 Horvitz–Thompson 比较

eps = 1.5 km，三颗都有覆盖的 52,188 场火：

| 方法 | 估计真实火数 | 观测到的倍数 |
| --- | --- | --- |
| 独立模型 | 74,302 | 1.42 |
| 加 VIIRS 配对相关（s:n） | 64,844 | 1.24 |
| **s:n + a:s（AIC 最佳）** | **72,380** | **1.39** |
| 全部两两交互 | 144,123 | 饱和模型，不稳定，不采用 |
| 模型二 Horvitz–Thompson | 85,556 | 1.64 |

- 合理范围：约 7.2 万–8.6 万场火，观测数的 1.4–1.6 倍
- **Aqua (MODIS) 只看到其中约 9,500 场 → 约 13%，也就是 MODIS 大约每 8 场火只看到 1 场**（简报头条数字）

### 敏感性：聚类半径 eps = 3.0 km

- 火数变少（相邻火合并）：43,705 场
- Aqua 侦测曲线几乎不变：1 km² 时 50% 点 16.9 MW（eps 1.5 时 18.5 MW）→ 曲线稳健
- 估计倍数：AIC 最佳模型 1.30，Horvitz–Thompson 1.56（eps 1.5 时 1.39 / 1.64）→ 倍数对 eps 不敏感

## 2026-11-08 · 对照组：澳洲东南部黑色夏季（2019-12 至 2020-01，下午窗）

范围：东经 140–154°、南纬 27–38°；三颗都有覆盖的 11,275 场火。
`s1_match.py` 新增按月份处理（大区域单年跑不完时使用）。

| 指标 | 婆罗洲 2019 年 8–10 月 | 澳洲黑色夏季 |
| --- | --- | --- |
| 每场火中位 FRP | 7.7 MW | 12.3 MW |
| 每场火中位像素数 | 2 | 4 |
| 三颗都看到（111）的比例 | 7% | 25% |
| 独立模型倍数 | 1.42 | **1.07** |
| VIIRS 配对相关模型倍数 | 1.24 | **1.06** |
| AIC 最佳模型（s:n + a:s）倍数 | 1.39 | 1.27 |
| 模型二 Horvitz–Thompson 倍数 | 1.64 | **1.22** |
| MODIS 看到的比例（相对 AIC 最佳估计） | 约 13% | 约 26% |

**结论：通过对照测试。** 火大、火热的澳洲，所有模型的修正倍数都比婆罗洲小，MODIS 看到的比例约为婆罗洲的两倍。
方法不是「一律灌水」，而是按火的性质给出不同修正。

**附带发现：** VIIRS 的像素面积系数在澳洲很小（−0.27），在婆罗洲很大（−1.28）。
婆罗洲的小火、云和烟让「离扫描正下方远一点」就严重影响侦测；澳洲的大火在哪个位置都看得到。
→ 侦测曲线必须按区域分别拟合，不能全球共用一条。

**诚实标注：** AIC 最佳模型在两地的差距（1.39 vs 1.27）比其他方法小，因为它的 a:s 交互项在澳洲变大。
简报里同时报告三种方法的范围，不只挑最好看的数字。

## Model 3 — MODIS-era backcast (2026-11-08)
Script: `pipeline/s3_backcast.py` (steps `fit` → `weights` → `final`, each <70 s on the 3 GB VM).
Outputs: `data/interim/models/backcast_fit_SEA_PM.json`, `backcast_SEA_PM.json`, `data/interim/weights/w_SEA_<Y>_PM.parquet`, `data/product/fires_weighted_SEA_PM.parquet` (one row per fire, `w_final`, `era`).

**Pooled fit** (SEA, PM window, 2012–2021, 15% sample = 855k fires, converged):
- FRP map (fires both saw): log FRP_VIIRS = 0.516 + 0.635 log FRP_MODIS
- Aqua: intercept −4.61, log_frp +1.60, log_area −1.45
- S-NPP: −4.34, +0.73, −1.62 · NOAA-20: −4.97, +0.83, −1.91
- Reading: Aqua's detection depends much more steeply on fire size than VIIRS → small fires are what MODIS misses.

**Residual factor R** (fires Aqua cannot see even after its own 1/p correction), by subregion × month: maritime 1.75–2.55; mainland 2.06–3.92 (highest Aug–Nov, small agricultural fires).

**E2 validation — leave-one-year-out, 2012–2021, 240 subregion-months (>200 fires):**
| | FireCensus (curve × R) | Naive ratio baseline |
|---|---|---|
| Median abs error | 12.5% | 14.0% |
| Median abs error, peak 10% months | 5.6% | 7.5% |
| log correlation | 0.988 | 0.986 |
Honest note: the improvement is real but modest (~1.5 pts overall, ~2 pts in peak months). The "truth" here is the 3-satellite estimate, so this tests consistency of the back-cast, not ground truth.

**Continuity at the 2011/2012 seam:** N̂/Aqua-raw maritime 13–14 (2009–11) vs 11–12 (2012–14); mainland 13–14 vs 11–13. Step ≈10%, within E2 error. Will check formally in E3.

**Caveats to state on the method page:**
- 2002 is partial: Aqua data begin July 2002, so the mainland Jan–Apr season is missing (2002 mainland N̂ = 32k is not comparable). Terra-AM extension still pending.
- N̂/Aqua-raw rises after 2017 (maritime 16–22 in 2017–2022). Likely Aqua orbit drift plus fewer, smaller fires. R is pooled over 2012–2021, so it is not affected by drift after 2022, but the overlap-era ratio should not be read as a trend.
- Weights are trimmed at p ≥ 0.05 (max weight 20).

## Step 4 — website data product (2026-11-10)
Script `pipeline/s4_product.py` (14 s). Outputs in `data/product/`:
- `cells_month.parquet`: 1.60 M rows, 0.1° cell × year × month. Columns: n_obs, n_hat, burning_days, frp_sum.
- `cells_clim.parquet`: 232 k rows, cell × month-of-year. Columns: median, p75, max over 2003–2025; absent years count as 0.
- `country_month.parquet`: 1,919 rows. Columns: n_hat plus raw counts per sensor.
- `country_calendar.parquet`: 84 rows, the burning calendar (median, p25, p75). Missing year-months are filled with 0.
- 2002 is excluded from the climatologies because it is a partial year.

**Sanity checks**
- **Burning calendar matches known seasons.**
  - Indonesia peaks in Sep (median 77.7 k), with an Aug–Oct season.
  - Thailand peaks in Mar (62.8 k), with a Jan–Apr season.
- **The harmonized annual series is continuous across 2011/2012.**
  - Indonesia: 363 k in 2011, 349 k in 2012.
  - The naive "best available sensor" count jumps ×4.4 at 2012 (28.7 k → 124.9 k). This is the core demo chart.
- **Peak years stand out:** 2006, 2015, 2019 and 2023, as expected for haze and El Niño years.

**Caveat**
- 2006 > 2015 in harmonized N (718 k vs 581 k). Aqua's own raw PM counts show the same order, so the back-cast does not cause it.
- Burned area and emissions are larger in 2015 (peat), but N counts fire *pixels-events*, not emissions. State this on the method page.

## Backend v0.1 (2026-11-10)
`backend/app.py` serves 10 endpoints. All of them were tested with TestClient: each returned 200, and the unknown-country request correctly returned 404.

**Response times**
- Typical call: ~50 ms.
- First `/cells` call: about 1–2 s, a one-time DuckDB warm-up.

**Checks**
- `/compare` for Indonesia, Sep 2019: N = 107 k against a 71 k median, a ratio of 1.51, at the 77th percentile, so it is labeled "above normal".
- `/calendar` gives Thailand's critical months as Feb–Mar, and Borneo's (from the bounding box) as Aug–Sep.

## Independent audit (2026-11-10, raw FIRMS CSVs read directly, no pipeline code)
| Check | Result | Pass? |
|---|---|---|
| A. S-NPP raw PM pixels ≥ product snpp_raw fires (Sep 2019) | Indonesia 105,829 px → 39,627 fires (2.67 px/fire); Malaysia 1,373 → 897; Brunei 26 → 23 | ✅ |
| B. Aqua raw PM pixels ≥ aqua_raw fires | Indonesia 17,452 → 9,771 (1.79 px/fire); Malaysia 335 → 240 | ✅ |
| C. Σ cells_month = country_month (Indonesia 2019-09) | 107,188.5 vs 107,163.0 (0.02% gap: border cells take one country) | ✅ |
| D. Peak months, raw VIIRS 2013–2025 vs product calendar | Thailand raw [3,2,4] = product [3,2,4]; Indonesia raw [9,10,8] = product [9,8,10] | ✅ |
| E. Indonesia year ranking, raw Aqua PM vs product N (2003–25) | identical top-5 [2006, 2015, 2004, 2009, 2014]; Spearman 0.978 | ✅ |
| F. Any cell with N < observed, NaN, or negative | 0 of 1,602,378 | ✅ |

**Finding (MODIS era is noisy at the cell level).** For 2002–2011 the median cell ratio N/observed is 13.0, with a p99 of 38.6. 36% of the back-cast N comes from fires with weight ≥ 20, meaning small fires that Aqua barely saw.

- Regional monthly totals are validated: E2 error is 12.5%.
- Single 0.1° cells are not reliable in that era.

**Action taken.** `/cells` now returns `spatial_confidence: "low"` plus a note for years before 2012. The web app should default to 0.5° for those years and show the caveat.
