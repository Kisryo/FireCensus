# NASA Space Apps 2026：MODIS 与 VIIRS 火点协调 — 深度研究

Oct 30, 2026 · @baibailee

## 一、题目到底要什么

题目要做的是一个网页应用：把 MODIS 和 VIIRS 两组火点记录整合成同一份「燃烧活动日历」，让使用者在自选区域内看懂历史火灾模式、异常状况和关键时期。

**官方目标原文**（参赛队伍转引）：Build a web application that harmonizes these records into a burning activity calendar based on active fire hotspots, enabling early warning and emergency responders, scientists, and land managers to examine historical fire patterns, unusual conditions, and critical periods within a selected area of interest. [来源](https://github.com/moonmia207/PyroSync)

拆开来看，这句话有五个硬性要求：

| 要求 | 意思 | 评审会怎么检查 |
| --- | --- | --- |
| harmonize | 两个传感器的记录要能直接比较 | 2012 年 VIIRS 加入时，曲线有没有假的跳升 |
| burning activity calendar | 输出形式是日历 | 能不能一眼看出每年哪几周在烧 |
| historical fire patterns | 正常季节长什么样 | 有没有长期基线和季节轮廓 |
| unusual conditions | 异常检测 | 哪些年、哪几周偏离正常，偏多少 |
| selected area of interest | 使用者自选区域 | 能不能换区域，结果会不会跟着变 |

使用者有三类：预警和救援人员、科学家、土地管理者。他们要的东西不同：救援人员要知道「什么时候最危险」，科学家要知道「趋势是不是真的」，土地管理者要知道「今年跟往年比怎样」。

### 为什么现在出这题

- Suomi NPP 的数据产品在 2026 年 11 月 1 日停止发布，正好是比赛前两周。[来源](https://www.earthdata.nasa.gov/data/catalog/lancemodis-vj114imgtdl-nrt-2)
- NASA 计划 2027 年 1 月停止 Terra MODIS 收集数据，Aqua MODIS 大约 2027 年 9 月停止。[来源](https://atmosphere.copernicus.eu/drifting-away-modis-cams-global-fire-assimilation-system)
- 也就是说，从 2000 年开始的 MODIS 火点记录即将结束。之后只剩 VIIRS（NOAA-20、NOAA-21，以及 2027 年后的 JPSS-3）。两组记录如果接不起来，25 年的火灾历史就没办法用来看趋势。

### 要交什么（新山场地页面）

- 项目摘要：做了什么、怎么解决题目
- 10 页简报 + 3 分钟视频
- 项目细节 + 公开链接（GitHub 或 Google Drive）
- 必须用到 NASA 数据，才有资格拿全球奖
- 截止：2026 年 11 月 15 日晚上 11:59（马来西亚时间）

### 评审标准

以下取自官方 Judging & Awards Guide（2024 年版，2026 年大概率沿用，比赛时再确认）。[来源](https://spaceappschallenge.org/resources/judging-awards-guide)

| 标准 | 官方定义（意译） | 对这题的意义 |
| --- | --- | --- |
| Influence | 能影响多少人、问题有多大 | 讲 MODIS 停机后 25 年记录断掉，以及东南亚烟霾 |
| Creativity | 是新做法，还是在现有方法上小修小补 | 主流队伍都做比例校准，这里是最大的拉开空间 |
| Validity | 科学上站得住、真的能用 | 要有验证实验和不确定性，不能只给一条曲线 |
| Relevance | 是否回应题目、完整度、可用性 | 日历、异常、关键期、自选区域，五项都要有 |
| Presentation | 讲清楚问题、方案和重要性 | 3 分钟视频和 10 页简报 |

和这题最相关的全球奖项：Best Use of Science、Best Use of Data、Local Impact Award。

**全球提名名额：** 本地场地由 Local Judges 选出提名作品，指南没有写固定名额；Universal Event 大约每 10 个作品选 1 个。新山是对全球开放的线上场地，竞争可能不小，所以 Creativity 和 Validity 是取胜关键。

### 官方题目页补充（2026-10-30 截取）

难度标注 Advanced / Intermediate，类别是 Earth Science / Software。[题目页](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)

**Objectives 分两部分：**

1. 协调 MODIS 与 VIIRS 火点，做到「数据来自哪个传感器已经不重要」，重点转到模式、趋势和异常。
2. 做一个以协调后数据为输入的网页应用：使用者选区域和日期范围，可以下载分析结果和图表。

**题目页点名的具体输出：**

- 从 2000 年代初至今的燃烧日历，单位是「侦测到的火点数」
- 哪个月、哪一年火最多；本月和历史中位数比较
- 按月的无障碍色阶
- 可下载的所选范围火点 CSV
- 建议：地图上画区域或输入经纬度；相对多年平均的异常；侦测到的火点数
- 官方数据建议：NASA Earthdata FIRMS 火点。完整数据清单在题目页的 Resources 分页，官方 11 月 13 日（星期五）才公布。

**对第四节方案的修正：**

- 日历主单位改成「VIIRS 等效火点数」：由 Λ 乘上 VIIRS 的观测算子换算回来，符合题目要的「火点数」，而且 MODIS 停机后可直接对接；λ 本身放在进阶视图。
- 必须有：日期范围选择、CSV 下载、本月 vs 历史中位数、按月热力日历。
- 区域不能只给一个固定区：预先把整个婆罗洲 + 苏门答腊 + 马来半岛算成 0.1° 格网，网页上画任何范围就按格子汇总。

## 二、主流做法与竞争格局

这题很热门：GitHub 上至少有 15 支队伍公开了方案。大多数队伍用的是「统计校准数字」，少数开始碎到物理；还没有人把两个传感器当成同一个真实火灾场的两组观测来联合估计。

| 队伍 / 项目 | 核心方法 | 亮点 | 没做到的 |
| --- | --- | --- | --- |
| [FireLens](https://github.com/shahmirkhan106/firelens) | OLS 回归 MODIS \~ a + b·VIIRS，按区域 | 实测同日 VIIRS 比 MODIS 多 2.2–4.9 倍火格 | 没有物理机制，不处理云和扫描角 |
| [EarthGuard](https://github.com/ekosantoso/earth) | 按月份算 VIIRS/MODIS 比例再相除 | 简单易懂 | 一个比例吃掉所有差异 |
| [FireCal](https://github.com/samuelakosaonyejekwe/firecal) | 按区域、月份校准，收缩到全球先验 | 有样本外验证、全球任意区域 | 仍是比例校准 |
| [EmberSync](https://github.com/Mosharrof8097/nasa_space_app_challange_2026) | 聚类 + 分位数映射 | 按生物群落调整聚类半径 | 把 VIIRS 压成 MODIS，丢掉小火信息 |
| [Vtheonly](https://github.com/Vtheonly/NasaSpaceApp2026) | LightGBM（Tweedie）+ PatchTST 预测 | ML 最重 | 黑箱，物理解释弱 |
| [Kiln Watch](https://github.com/Aalvee-Aarham/kiln-watch) | 统一成 Aqua-MODIS 等效单位，按云量归一化 | 留一季验证、有 95% 区间 | 仍以 MODIS 为上限，小火被舍弃 |
| [Emberline](https://github.com/AbhiramNimmala/Emberline) | 共享格网 + 按区域和地表覆盖校准 | 去工业热源、提到轨道漂移 | 漂移没有量化进模型 |
| [Flare-Chronos](https://github.com/the-aris-club/flare-chronos) | 扫描角观测算子 + 分层分位数映射，观测努力量归一化 | 最接近物理做法：重建像素足迹、H3 格网 | 仍是「把一个转成另一个」，没有联合反推 |

### 主流做法的共同盲点

1. **把 VIIRS 当麻烦。** 多数队伍以 MODIS 为标准，把 VIIRS 缩小。代价是丢掉 VIIRS 独有的小火信息，而东南亚泥炭火恰恰就是小火。
2. **一个比例吃掉所有差异。** 传感器差异来自像素面积、扫描角、日夜、过境时间、云量，每项的影响都不同。用一个比例混在一起，换个季节或区域就不准。
3. **MODIS 停机后无解。** 校准式「MODIS = f(VIIRS)」靠重叠期来拟合。2027 年后没有 MODIS，就无法检查这个关系有没有漂移。
4. **不确定性大多是事后补的。** 少数队伍给了区间，但大多是校准残差，而不是来自模型本身。

### 对我们的启示

- 「用比例或分位数校准」已经是基本盘，只做这个拿不到 Creativity 分。
- Flare-Chronos 已经用了「观测算子」这个词，所以我们不能只靠这个词。真正的差异化在于「联合反推同一个真实火灾场」，以及「用 VIIRS 补回 MODIS 漏掉的小火」（见第四节）。
- 提醒：部分队伍在比赛前就写好了代码，这违反规则。我们现在只做研究和设计。

## 三、NASA 和科学界真正的思路

科学界的共识是：MODIS 和 VIIRS 的差异主要来自「空间取样」和「侦测极限」，不是算法本身。正规做法是先为每个传感器建立「它会看到什么、漏掉什么」的模型，再合并。NASA 自己的 GFED5NRT 团队也承认，完整融合两个传感器的记录仍是尚未完成的优先事项。

### 3.1 两个传感器差在哪里

| 项目 | MODIS（Terra / Aqua） | VIIRS 375 m（S-NPP / NOAA-20 / NOAA-21） | 来源 |
| --- | --- | --- | --- |
| 正下方像素 | 1 km | 375 m | [FIRMS 字段说明](https://gee-community-catalog.org/projects/firms_vector/) |
| 边缘像素 | 向扫描边缘变大很多；CSV 的 scan、track 是实际尺寸 | 星上聚合压住了变大幅度 | [Schroeder 2017](https://gofcgold.umd.edu/sites/default/files/fireit_meetings/GOFC_Fire_IT_2017/day1/Schroeder.pdf) |
| 过境时间（当地时间） | Terra 约 10:30、Aqua 约 13:30，目前都已漂移 | 约 01:30 和 13:30，没有早上过境 | [Justice](https://gslcluc1.umd.edu/sites/default/files/Chris_Justice_Fires.pdf)、[Schroeder 2014](https://directreadout.sci.gsfc.nasa.gov/publications_documents/Schroeder_et_al_2014b_RSE.pdf) |
| 跨扫描带的 FRP | 边缘平均每像素 FRP 可比正下方高 300% | 大致稳定 | [Zhang、NOAA](https://repository.library.noaa.gov/view/noaa/49896/noaa_49896_DS1.pdf) |
| 夜间侦测极限 | 3.7 MW（正下方），边缘约 39 MW | 0.5–0.7 MW | [Sofiev 2026](https://gmd.copernicus.org/articles/19/10123/2026/) |
| 白天侦测极限 | 5.7 MW（正下方），边缘约 42 MW | 3.7 MW | [Sofiev 2026](https://gmd.copernicus.org/articles/19/10123/2026/) |
| 可靠侦测强火的概率（全球 / 赤道） | 78% / 低于 30% | 88% / 低于 40% | [Sofiev 2026](https://gmd.copernicus.org/articles/19/10123/2026/) |

两个关键发现：

- VIIRS 375 m 比 750 m 产品白天多侦测到 3 倍的火像素，夜间多 25 倍。[来源](https://directreadout.sci.gsfc.nasa.gov/publications_documents/Schroeder_et_al_2014b_RSE.pdf) 所以 VIIRS 多出来的火点大部分是「小火」和「夜间火」，不是重复计算。
- 一度格网尺度下，两者的 FRP 差异平均大约 20%；但在火簇尺度下两者很接近。[来源](https://repository.library.noaa.gov/view/noaa/49896/noaa_49896_DS1.pdf) 差异取决于尺度，所以「一个比例」不可能对。

### 3.2 侦测极限与观测算子（整个方案的物理核心）

Sofiev 和 Kouznetsov（2026，GMD）发现，每个像素的 FRP 侦测极限几乎是像素面积的线性函数（相关系数高于 0.999）。[来源](https://gmd.copernicus.org/articles/19/10123/2026/)

```latex
D_p = \lambda \cdot A_p + \mu
```

其中 A\_p 是像素面积（km²），λ、μ 按传感器和日夜各不相同（见论文 Table 1–2）。一场真实 FRP 为 P 的火，被看到的程度用 S 形曲线描述：

```latex
P_{obs} = P \cdot \frac{1}{1-c_o} \cdot \max\left(0,\ \frac{1}{1+e^{-r_p (P - D_p)}} - c_o\right)
```

这就是「观测算子」：输入真实火，输出传感器会报告的值。论文还做了对称交叉映射：把 VIIRS 的算子套到 MODIS 上，反过来也一样。以 2020 年为例，原始总 FRP 是 MODIS 128 TW 对 VIIRS 177 TW；套上算子后变成 88 TW 对 106 TW，剩下约 20–23% 的差异归因于 Aqua 过境时间较晚。

格网版本还把「云和缺测」纳入：格子里有效观测的比例 β 越低，侦测极限越高。这正是「没侦测到不等于没有火」的数学写法。

### 3.3 日变化与轨道漂移

- 火有强烈的日变化，热带和亚热带尤其明显。[Giglio 2006](https://modis.gsfc.nasa.gov/sci_team/pubs/abstract_new.php?id=02543) 不同过境时间看到的火本来就不同。
- 1 km 传感器低估地景尺度 FRP 大约三分之一；离下午 3 点的火高峰越远，漏得越多。[Sperling 2020](https://nrfirescience.org/node/21297)
- Terra 和 Aqua 的轨道漂移改变了像素大小、像素间距和日变化取样；沿扫描方向的像素在 2025 年春天已经从 1 km 变成约 970 m。[Giglio 2025](https://landweb.modaps.eosdis.nasa.gov/data/filePost/LANCE_UWG_Orbit_Drift_Giglio_202505.pdf)
- NASA 科学家把漂移当成机会：漂移后的 Terra 会在新的时间点观测，可以用来和其他传感器交叉校准。[Morton、Giglio 2022](https://modis.gsfc.nasa.gov/sci_team/meetings/202211/presentations/giglioRoyRanderson.pdf)

### 3.4 「看不见的小火」怎么补

FRP 的频率分布有固定形状：小火远多于大火，大致呈幂律。地球同步卫星 SEVIRI 的侦测极限比 MODIS 高，区域总 FRP 比 MODIS 低估 40–50%；研究者用「频率-强度分析」把这部分补回来。[Roberts & Wooster 2008](https://modarch.gsfc.nasa.gov/sci_team/pubs/abstract_new.php?id=01841)

这套方法原本用在「粗传感器 vs 细传感器」。MODIS vs VIIRS 正好是同一种关系：VIIRS 看得到 MODIS 看不到的低 FRP 那一段，可以用来「教」模型这段分布长什么样。

### 3.5 NASA 和各机构的实际做法

| 系统 | 做法 | 启示 |
| --- | --- | --- |
| [VIIRS 750 m VNP14](https://viirsland.gsfc.nasa.gov/Products/NASA/FireESDR.html) | 保留 750 m 产品，专门维持和 MODIS 1 km 的连续性 | NASA 本身的策略是「让传感器看起来像 MODIS」 |
| [GFED5](https://essd.copernicus.org/articles/15/5227/2023/) | 用 Landsat / Sentinel-2 的高分辨率数据约束比例，从活跃火点推算小火烧毁面积；农田、泥炭地、毁林区都这样做 | 用更细的传感器校正粗传感器 |
| [GFED5NRT](https://essd.copernicus.org/articles/18/7535/2026/) | 在 2012–2022 重叠期按区域×生物群落算「每个 VIIRS 火点对应多少烧毁面积」，用来接续 MODIS 停机后的记录 | 作者自己说，完整融合两个传感器仍是优先事项、需要更多投入 |
| [CAMS GFAS](https://www.mdpi.com/2072-4292/11/10/1205) | 对 MODIS 和 VIIRS 格网 FRP 做偏差校正后同化进模型 | 先校正观测、再合并 |
| [FEDS（NASA 野火追踪实验室）](https://gis.earthdata.nasa.gov/image/rest/services/FireTracking/Fire_Events_Data_Suite_Fire_Perimeters_NRT/MapServer/0) | 把 VIIRS 火点聚成「火事件」，每 12 小时追踪其边界和强度 | 以「事件」为单位，不以像素为单位 |
| [Correction-before-fusion（2026）](https://www.mdpi.com/2072-4292/18/10/1650) | 去重、足迹匹配、VIIRS 云校正、按视角校正 MODIS FRP，再按质量融合 | 融合后火像素是原 MODIS 的 3.82 倍 |

另外，NASA 的 Andela 在 GFED 实时系统里只用离正下方 750 km 以内的 VIIRS 数据，来压低扫描角的影响。[来源](https://tftei.citepa.org/images/files/2019-10-22-23-24/3.%20MARINELAND-UN-FIRE-WORSHOP-242019.pdf)

### 3.6 东南亚：为什么这里特别需要这套方法

- 泥炭火是低强度燃烧，可以烧进地下深达 0.5 m 的泥炭层，而且烧很久。[Atwood 2016](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4972419/)
- 赤道地区 MODIS 可靠侦测强火的概率低于 30%，VIIRS 低于 40%，主要是云。[Sofiev 2026](https://gmd.copernicus.org/articles/19/10123/2026/)
- MODIS 烧毁面积产品很难分辨小火，云和烟还会随火季推进越来越严重。[SDSU 论文](https://openprairie.sdstate.edu/etd/5205)
- VIIRS 夜间数据已经被用来识别印尼 320–500 K 的低温闷烧。[Elvidge](https://www.taylorfrancis.com/chapters/edit/10.1201/9780429022258-2/identification-smoldering-peatland-fires-indonesia-via-triple-phase-temperature-analysis-viirs-nighttime-data-christopher-elvidge-mikhail-zhizhin-kimberly-baugh-feng-chi-hsu)
- 2015 年印尼火灾引发的东南亚烟霾波及文莱、印尼、马来西亚、新加坡等国。[Atwood 2016](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4972419/)

结论：在东南亚，「MODIS 漏掉了多少」不是细节，而是重点。以 MODIS 为标准压缩 VIIRS 的主流做法，在这个区域会把最重要的信号丢掉。

## 四、建议方案：「同一场火，两双眼睛」

核心主张：不把一个传感器转换成另一个，而是把两者当成同一个「真实火灾场」的两组不完美观测，用物理观测算子联合反推。这是数据同化（data assimilation）的思路，和 CAMS GFAS、Sofiev 2026 是同一个家族，只是我们做成轻量的层级贝叶斯版本。

### 4.1 与 Flare-Chronos 等队伍的区别

|  | 主流（比例 / 分位数） | Flare-Chronos（算子 + 分位数） | 本方案 |
| --- | --- | --- | --- |
| 问题形式 | MODIS = f(VIIRS) | 先校正视角，再把 Aqua 映射到 S-NPP | 两者都是同一个潜在火灾场 Λ 的观测 |
| VIIRS 小火 | 压掉 | 压掉 | 用来学 FRP 分布的低端，补回 MODIS 时代漏掉的火 |
| 日变化 | 忽略 | 靠去重时间窗 | 四个过境时间联合估计日变化曲线 |
| MODIS 停机后 | 校准式不再能检验 | 同左 | 同一模型只用 VIIRS 观测继续估计 Λ |
| 不确定性 | 事后残差 | 无或很少 | 来自模型后验，云多的日子自动变宽 |

### 4.2 模型

&#91;embedded content: 模型结构 · 一个潜在火灾场、两个观测算子、一次联合推断\]

往下是生成方向：真实火灾经过各自的观测算子，变成两组火点。往上是推断方向：两组火点一起反推同一个 Λ。

符号：g = 格子（0.1°），t = 日期，o = 一次过境（传感器 s、当地时间 h、像素面积 A、日或夜）。

**第一层：真实火灾（看不见）**

- Λ(g,t)：格子 g 在第 t 天的「真实活跃火数」，也就是日历要呈现的量。
- 每场火的 FRP 服从区域×季节的分布 f(P; θ)，用截断幂律或对数正态。
- 火的日变化曲线 d(h; φ)：一天中不同时刻正在烧的比例。

**第二层：观测算子（物理）**

一场 FRP 为 P 的火被传感器 s 看到的概率，用 Sofiev 的 S 形曲线：σ(P − D\_s(A))，其中 D\_s(A) = λ\_s·A + μ\_s。整体「可见比例」：

```latex
\pi_s(A) = \int f(P;\theta)\, \sigma\big(P - D_s(A)\big)\, dP
```

**第三层：观测（FIRMS 火点）**

一次过境 o 在格子 g 里侦测到的火点数：

```latex
C_{o} \sim \mathrm{Poisson}\big(\Lambda_{g,t}\cdot d(h_o;\varphi)\cdot \beta_o \cdot \pi_s(A_o) \cdot k_s\big)
```

β\_o = 晴空比例，k\_s = 一场火在该传感器里平均占几个像素（VIIRS 一场火常占多格）。每个侦测到的火点还带着 FRP，它是 f(P; θ) 在 D\_s(A) 处截断后的样本。VIIRS 的截断点低很多，所以它把 θ 的低端「钉」住。

### 4.3 为什么是 1+1 ≥ 2

1. **补回小火。** 只有 MODIS，θ 的低端估不出来；只有 VIIRS，没有 2012 年以前的记录。联合后，VIIRS 学到的 θ 可以算出 2000–2011 年 MODIS 的可见比例 π，把漏掉的火补回来。
2. **日变化。** Terra 早上、Aqua 和 VIIRS 下午、VIIRS 半夜，合起来有四个时刻，再加上轨道漂移带来的新时刻。任何一个传感器单独都估不出完整的日变化，合起来就可以。Sofiev 论文里剩下的 20–23% 差异正是过境时间造成的。
3. **互相验证，并无缝接续。** 模型可以「用 VIIRS 模拟 MODIS 会看到什么」，反之亦然。MODIS 停机后，θ 和 φ 已经学好，Λ 照样可以估计。
4. **诚实的不确定性。** 云多、只有一次过境、只有 MODIS 的年份，可信区间自动变宽。日历上可以直接呈现。

### 4.4 简化与可行性（48 小时一个人）

- **像素面积：** FIRMS CSV 的 scan × track 就是 A（km²）。没侦测到火的过境没有 A，就用该传感器在这个区域的 A 经验分布做边际化（简化点，报告里要写明）。
- **λ、μ：** 取 Sofiev 2026 Table 1–2 的值当先验；表里没有的就用文中的锚点（3.7、5.7、约 40 MW 等）拟合一条线。
- **晴空比例 β：** FIRMS CSV 没有云。第一版把 β 当成每月一个参数，由模型吸收；有时间再加 MOD14A1 / VNP14A1 的「非火、云」分类。
- **推断：** 用 NumPyro 或 PyMC 做变分推断；太慢就退到 Plan B。
- **Plan B（经验贝叶斯）：** ① 用重叠期 VIIRS FRP 以最大似然拟合截断幂律 θ；② 算出每个传感器、每月的 π；③ Λ = 观测数 / (π·k·d)，再按各自方差加权合并；④ 区间用 bootstrap。这个版本半天就能跑通。
- **区域：** 先做一个，建议中加里曼丹（含 2015、2019 烟霾年），再加一个对照区（如澳洲或非洲草原）证明方法通用。

### 4.5 验证实验（这是 Validity 的分）

| 实验 | 做法 | 成功的标准 | 对照组 |
| --- | --- | --- | --- |
| E1 用 VIIRS 模拟 MODIS | 重叠期把 MODIS 算子套到 VIIRS 火点上，预测每格每天的 MODIS 火点数 | 误差明显低于对照组 | 单一比例、按月比例 |
| E2 抽掉一个传感器 | 藏起 2013–2014 的 MODIS，只用 VIIRS 估 Λ，再预测 MODIS | 预测落在 90% 区间内的比例接近 90% | 同上 |
| E3 2012 跳升测试 | 对协调后的序列做变化点检验 | 2012 年没有显著跳升 | 原始相加序列 |
| E4 烟霾年案例 | 2015、2019 年中加里曼丹的火季 | 2015 为极端年；补回的小火比例合理 | GFED5 或 FAVE 的年际变化 |

### 4.6 产品：燃烧活动日历

- **主视图：** 年 × 周的热力图（2000–2026），颜色 = 协调后的 Λ；点开任一格看到每日曲线和可信区间。
- **异常：** 某周 Λ 超过历史 90 百分位的后验概率 ≥ 0.8 就标记，用概率而不是 z 分数。
- **关键期：** 每年「累计 Λ 达到 50%」的日期和峰值周，配上历年范围。
- **杀手画面：** 「消失的火」图层。同一张日历切换「只用 MODIS」和「联合估计」，直接看出 2000–2011 年东南亚被低估了多少燃烧。
- **技术栈：** Python（pandas、NumPyro / SciPy）先离线算好导出 Parquet / JSON，前端用 Next.js + Tailwind + 地图和热力图。这是你熟悉的栈。

### 4.7 对应评审标准

| 标准 | 方案里的对应点 |
| --- | --- |
| Influence | MODIS 停机后 25 年记录的延续；东南亚烟霾影响数千万人 |
| Creativity | 潜在火灾场 + 双观测算子、补回小火、联合日变化 |
| Validity | E1–E4 验证、后验区间、引用 2026 年最新文献 |
| Relevance | 日历、历史模式、异常、关键期、自选区域，五项都覆盖 |
| Presentation | 「消失的火」前后对比；以 2026 年 11 月 1 日 S-NPP 停发开场 |

## 四点五、跨学科算法创新：用「数动物」的方法数火

建议的核心引擎是生态学的「多源捕获-再捕获」加上「距离取样」：把 5 颗带火点传感器的卫星当成 5 个独立性不完美的观察者，估计「所有卫星都漏掉的火」。物理和化学放在输出层，把火点日历换算成「燃烧量」和「烟霾」。这一节升级第四节的引擎，不推翻它。

### 新颖性检查（2026-10-31）

- 我没找到把捕获-再捕获用在 MODIS / VIIRS 活跃火点的文献或参赛队伍。最接近的是 Sofiev 2026 的观测算子，以及 Fu 2020 的互相漏测率分析。报告里写「据我们检索」。
- 有人用 Lincoln-Petersen 和相关方法，拿两个消防机构的数据库估计火灾起数。[来源](https://www.aer.gov.au/system/files/Rho%20Environmetrics%20and%20John%20Field%20Consulting%20%20-%20f-factor%20scheme%20-%20received%202%20December%202011.pdf) 说明这套方法用在「火」的清单上是可行的。
- 前提条件成立：东北亚 2012–2017 年的数据里，VIIRS 火像素有 65%（森林）和 83%（低生物量地）被 MODIS 漏掉；反过来 MODIS 火像素也有 35% 和 53% 被 VIIRS 漏掉。[Fu 2020](https://modis.gsfc.nasa.gov/sci_team/pubs/abstract_new.php?id=38581) 两边互相漏，重叠就有信息量。

### 候选方法一览

| 方法 | 学科 | 在火灾问题里对应什么 | 48 小时可行 | 建议 |
| --- | --- | --- | --- | --- |
| [多源估计 MSE（对数线性模型）](https://pmc.ncbi.nlm.nih.gov/articles/PMC6055983/) | 生态学 / 流行病学 | 5 颗卫星 = 5 份名单；估计所有名单都没有的火 | 高 | 核心 |
| [标记-再捕获距离取样 MRDS](https://link.springer.com/article/10.1007/s10182-016-0287-7) | 生态学 | 侦测率随「距离」下降 = 随扫描角、像素面积下降 | 高 | 核心，和 MSE 合并 |
| [占据模型](https://pubs.usgs.gov/publication/5224260) | 生态学 | 格子当天「有没有在烧」；多次过境 = 重复调查 | 高 | 日历的第二指标 |
| [N-mixture](https://www.usgs.gov/publications/n-mixture-models-estimating-population-size-spatially-replicated-counts) | 生态学 | 不匹配个体也能估个数 | 中 | 备选；有可识别性问题 |
| [FRE → 燃烧生物量](https://repository.library.noaa.gov/view/noaa/48652) | 物理 | 把协调后的 FRP 积分成燃烧量 | 高 | 输出层 |
| [泥炭烟排放因子](https://acp.copernicus.org/articles/18/2585/2018/) | 大气化学 | 燃烧量 → PM2.5，接上烟霾故事 | 高 | 输出层 |
| [Hawkes / ETAS](https://researchseminars.org/talk/gbgphd/49/) | 地震学 | 「火引发火」，用来标关键期 | 低 | 有余力再做 |
| [普朗克三相拟合](https://www.taylorfrancis.com/chapters/edit/10.1201/9780429022258-2/identification-smoldering-peatland-fires-indonesia-via-triple-phase-temperature-analysis-viirs-nighttime-data-christopher-elvidge-mikhail-zhizhin-kimberly-baugh-feng-chi-hsu) | 物理 | 区分明火和闷烧 | 低 | 不做：FIRMS 只有两个波段亮温，不够拟合 |

### 核心引擎：「火灾普查」

**概念对应**

| 生态学 | 本方案 |
| --- | --- |
| 个体（一只动物） | 一场火：同一个小时窗内，彼此相距一两公里内的火点组成的簇 |
| 捕捉场次 / 名单 | Aqua MODIS、S-NPP VIIRS、NOAA-20 VIIRS（都在下午）；上午另算 Terra |
| 捕获历史 | 每场火一个 0/1 向量，例如 (1,0,1) = Aqua 和 NOAA-20 看到，S-NPP 没看到 |
| 距离（离观察者越远越难看到） | 像素面积 A = scan × track（离正下方越远，像素越大） |
| 个体协变量（体型、毛色） | 火的 FRP、日或夜、地表类型（是否泥炭地） |
| 封闭性假设 | 只用过境时间接近的卫星配对（用 acq\_time 核实） |

**第一步：多源对数线性模型（处理卫星之间不独立）**

只有两份名单时，必须假设两者独立。要处理名单之间的依赖，至少需要三份名单，再用对数线性模型拟合。[来源](https://pmc.ncbi.nlm.nih.gov/articles/PMC9826711) 我们有 Aqua、S-NPP、NOAA-20 三份：

```latex
\log \mathbb{E}[Y_{ijk}] = \beta_0 + \beta_1 i + \beta_2 j + \beta_3 k + \gamma_{12}\, ij + \gamma_{23}\, jk + \gamma_{13}\, ik
```

Y\_ijk 是捕获历史为 (i,j,k) 的火数。(0,0,0) 那格看不到，就是「三颗卫星都漏掉的火」，由 exp(β₀) 估计。γ 项吸收卫星之间的正相关。S-NPP 和 NOAA-20 是同一种仪器，γ₂₃ 预期最大。用 AIC 挑选交互项，稀疏格子按区域×月份合并。

**第二步：加入协变量（Huggins 条件似然，即距离取样思想）**

每场火 i 被卫星 s 看到的概率：

```latex
\operatorname{logit} p_{is} = \alpha_s + \beta_{1s}\log \mathrm{FRP}_i + \beta_{2s} A_{is} + \beta_{3s}\,\mathrm{night}_i + \beta_{4s}\,\mathrm{peat}_i
```

这条曲线就是「从数据学出来的观测算子」。画出来和 Sofiev 2026 的侦测极限对照，对得上就是很强的 Validity 证据；对不上，就是东南亚烟霾和云的本地效应，也是发现。

**第三步：用 Horvitz–Thompson 推回 MODIS 年代**

2000–2011 年只有 MODIS，每个侦测到的火按「被看到的概率」加权：

```latex
\hat{N}_{g,t} = \sum_{i \in \text{MODIS}(g,t)} \frac{1}{\hat{p}_{i,\mathrm{MODIS}}}
```

一场很容易被漏掉的小火，只要被看到一次，就代表「还有很多同类火没被看到」。p 接近 0 的火（低于侦测极限）完全看不到，这部分交给第四节的 FRP 分布 θ 外推。两者分工：Horvitz–Thompson 管「看得见但常漏」的火，θ 管「永远看不见」的火。

**为什么这是 1+1 > 2：** 任何单一卫星都无法估计自己的侦测率。两颗就能互相当对方的「标记」，三颗以上还能估计它们之间有多相关。卫星越多，估计越准；2024 年 NOAA-21 加入后就有第四份名单。

### 验证（补充第 4.5 节）

| 实验 | 做法 | 成功的标准 |
| --- | --- | --- |
| E5 合成数据 | 先生成已知数量的火，套上 Sofiev 算子模拟三颗卫星的侦测，再用模型估计 N | 能估回已知的 N，区间覆盖率接近名义值 |
| E6 抽掉一颗卫星 | 只用 Aqua + NOAA-20 估计 N 和 p，预测 S-NPP 会看到多少火 | 预测与实际的误差小于比例法 |
| E7 曲线对照 | 学到的 p(FRP, A) 和 Sofiev 2026 的 D = λA + μ 画在同一张图 | 50% 侦测点和 D 趋势一致 |

### 输出层：物理和化学

把「火点数」延伸成「烧掉多少、放出多少烟」，接上马来西亚用户最关心的烟霾。

1. **FRP → FRE（物理）：** 用第四节估计的日变化曲线，把瞬时 FRP 在一天内积分成火辐射能 FRE。
2. **FRE → 燃烧量（物理）：** FRE 和燃烧生物量呈线性关系；系数在野外和实验室是 0.368–0.453 kg/MJ，卫星方法得到的是 0.266–0.374 kg/MJ。[来源](https://repository.library.noaa.gov/view/noaa/48652) 用范围呈现，不用单一值。
3. **燃烧量 → PM2.5（化学）：** 2015 年中加里曼丹泥炭烟羽的修正燃烧效率（MCE）是 0.725–0.833，属于闷烧；PM2.5 排放因子平均 17.3 ± 6.0 g/kg。[Jayarathne 2018](https://acp.copernicus.org/articles/18/2585/2018/)
4. **验证锚点：** 同一研究估计 2015 年印尼泥炭火排放了 3.2–11 Tg PM2.5。我们算出来的 2015 年值落在这个范围内，就是一个独立的合理性检查。

化学上的关键是：闷烧（低 MCE）比明火产生更多 PM2.5 和 CO，而闷烧恰恰最容易被 MODIS 漏掉。所以补回小火不只是数字变大，而是烟霾估计会被不成比例地修正。这是给评审的 Influence 故事。

### 风险与对策

- **封闭性：** 火会在两次过境之间燃起或熄灭。只用时间接近的卫星配对，并在报告里写明时间窗。
- **匹配误差：** 定位误差会把同一场火拆成两场，或把两场合成一场。做聚类半径的敏感性分析（1、2、3 km）。
- **云造成的正相关：** 对数线性交互项只能吸收一部分，剩余的让估计偏低，所以结果定位为「保守下限」。
- **稀疏格子：** 交叉格数量少时，常规的模型选择会失效。[来源](https://escholarship.org/uc/item/20d436t9) 按区域×月份合并，并报告多个模型的结果。
- **排放因子只适用于泥炭：** 非泥炭地要换一套排放因子；第一版可以只对泥炭地格子显示烟霾层。

## 完整方案（最终版）：FireCensus 火灾普查

**一句话：** FireCensus 把 5 颗火点卫星当成互相独立性不完美的「观察员」，用生态学数动物的方法估计「真正烧了多少火」，再把 2000 年至今的记录做成一份与传感器无关的燃烧日历。

**英文版（用于提交页）：** FireCensus counts fires the way ecologists count animals. Treating MODIS and VIIRS satellites as imperfect, overlapping observers, it estimates how many fires every sensor missed, then builds a sensor-independent burning activity calendar from 2000 to today.

**三个卖点：**

1. **可以估计所有卫星都没看到的火。** 这是任何单一传感器、任何「把 A 转换成 B」的校准法都做不到的。
2. **侦测曲线从数据学出来，再拿物理公式对照。** 对得上是科学验证，对不上是东南亚的本地发现。
3. **MODIS 停机后依然有效。** 卫星越多估计越准，2024 年起三颗 VIIRS 同时在轨。

&#91;embedded content: FireCensus 流程 · 配对、两个并行模型、推回过去、两类输出\]

模型一和模型二各自估计重叠期的火数并互相核对；模型二学到的侦测曲线再被模型三用来推回只有 MODIS 的年代。

### 0. 已定决定（2026-11-01）

| 项目 | 决定 | 备注 |
| --- | --- | --- |
| 覆盖范围 | 印尼、马来西亚、文莱、澳洲、泰国、缅甸、老挝（柬埔寨可选） | 3 个传感器数据已下载完成 |
| 主角案例 | 2019 年加里曼丹与苏门答腊泥炭火 | Aqua、S-NPP、NOAA-20 三份名单 |
| 历史对照 | 2015 年同一地区 | 只有两份名单，结果标为下限 |
| 对照组 | 2019–20 年澳洲黑色夏季 | 大火，修正应该很小 |
| 加分案例 | 泰缅老烧芭季（2019 或 2023 年 3 月） | 时间不够就砍 |
| 后端 | FastAPI + DuckDB 读 Parquet | 需要长期在线的托管 |
| 前端 | 全站 3D：Spline 做首页叙事，react-three-fiber 做数据视图 | 每个 3D 数据视图都要有 2D 切换 |
| 格子 | 计算 0.1°，显示 0.25° |  |

### 1. 数据

全部来自 NASA FIRMS 标准处理档案（Standard Processing），范围是苏门答腊、婆罗洲、马来半岛（约东经 95–120°、南纬 6° 至北纬 8°）。

| 传感器 | 平台 | 年份 | 过境（当地时间） | 在方案里的角色 |
| --- | --- | --- | --- | --- |
| MODIS 1 km | Terra | 2000– | 约 10:30 | 上午的唯一观察员 |
| MODIS 1 km | Aqua | 2002– | 约 13:30，2022 年起自由漂移、逐渐推迟 | 连接新旧记录的关键 |
| VIIRS 375 m | S-NPP | 2012– | 约 13:30 | 重叠期主力 |
| VIIRS 375 m | NOAA-20 | 2018– | 与 S-NPP 同轨道，相差约 25–50 分钟 | 第三份名单 |
| VIIRS 375 m | NOAA-21 | 2023– | 同轨道，比 S-NPP 早约 25 分钟 | 第四份名单 |

过境时差来源：2024 年 4 月起依次是 NOAA-21、约 25 分钟后 S-NPP、再约 25 分钟后 NOAA-20。[CIRA](https://rammb2.cira.colostate.edu/visit-blog/2024/05/03/noaa-21-designated-as-the-primary-satellite-of-the-jpss-constellation) 在此之前 NOAA-20 和 S-NPP 相隔约 50 分钟。[NOAA](https://www.nesdis.noaa.gov/news/two-satellites-one-orbit-many-benefits) Aqua 从 2022 年起自由漂移，赤道过境时间慢慢变晚。[Aqua](<https://www.wikiwand.com/en/Aqua_(satellite)>) 实际配对一律以 CSV 的 acq\_time 为准。

用到的字段：latitude、longitude、acq\_date、acq\_time、satellite、scan、track、frp、daynight、confidence、type。

辅助数据（可选）：泥炭地分布图，用来做「是否泥炭」协变量和烟霾层。

### 2. 预处理

1. **过滤：** 只留 type = 0（植被火）。两个传感器的 confidence 定义不同，不同的过滤门槛会改变侦测率；先全保留，再把「去掉低可信度」当敏感性分析。
2. **过境重建：** 同一 satellite、同一天、acq\_time 相差 10 分钟内的点归为一次过境；用「UTC + 经度 ÷ 15」算出当地太阳时。
3. **像素面积：** A = scan × track（km²）。
4. **格网：** 0.1° 格子，每个点记录所属格子。

### 3. 配对：哪些火点算「同一场火」

这是整个方法最容易出错的地方，规则要先定死。

- **捕捉窗（场次）：** 同一天下午，当地时间约 12:30–15:30 之间的所有过境算一个捕捉窗。夜间（约 00:30–03:30）另算一个。Terra 上午过境离得太远，不进捕捉窗，只用于第 6 步的日变化。
- **空间聚类：** 捕捉窗内，所有传感器的点一起做 DBSCAN（球面距离，eps = 1.5 km，min\_samples = 1）。一个簇 = 一场火。敏感性分析测 1.0、2.0、3.0 km。
- **捕获历史：** 每场火一个 0/1 向量，例如 (Aqua, S-NPP, NOAA-20) = (1, 0, 1)。
- **「没看到」和「没飞过」要分开：** 卫星这次根本没有覆盖这里（例如 MODIS 低纬度扫描间隙），就不能算「漏掉」。判定办法：同一次过境在 300 km 内有任何火点，就视为有覆盖；否则这个场次对这场火记为缺失，而不是 0。这是近似做法，报告里写明。
- **协变量：** 火的 FRP 取簇内 VIIRS 最大值（没有 VIIRS 时用 MODIS）；某传感器在这场火的像素面积，若它没侦测到，就用同次过境 50 km 内其他火点的 A 插补；日或夜；是否泥炭地；两次过境的时间差。

### 4. 模型一：多源估计（估计「全部漏掉」的火数）

分层（区域 × 月份 × 日/夜）统计每种捕获历史的火数，拟合泊松对数线性模型：

```latex
\log \mathbb{E}[Y_{ijk}] = \beta_0 + \beta_1 i + \beta_2 j + \beta_3 k + \gamma_{12}\, ij + \gamma_{23}\, jk + \gamma_{13}\, ik
```

- (0,0,0) 格的估计值 exp(β₀) = 三颗卫星都漏掉的火。
- γ 吸收卫星之间的相关：S-NPP 和 NOAA-20 是同一种仪器、受同一片云影响，γ₂₃ 预期为正且最大。
- 模型选择用 AIC，同时报告「独立模型」和「全交互模型」的结果作为上下界；可信区间用 bootstrap。
- 按年代切换名单：2012–2017 年只有 Aqua + S-NPP 两份（只能用独立假设，结果标为下限）；2018 年起三份；2024 年起四份。

### 5. 模型二：侦测曲线（距离取样 + Huggins 条件似然）

每场火 i 被卫星 s 看到的概率是它自己协变量的函数：

```latex
\operatorname{logit} p_{is} = \alpha_s + \beta_{1s}\log \mathrm{FRP}_i + \beta_{2s} A_{is} + \beta_{3s}\,\mathrm{night}_i + \beta_{4s}\,\mathrm{peat}_i
```

- 只用「至少被一颗卫星看到」的火拟合（条件似然），所以不需要知道没被看到的火的协变量。
- A 就是生态学里的「距离」：离正下方越远，像素越大，越难看到。
- 产出：每颗卫星的侦测曲线 p(FRP, A)。把 50% 侦测点和 Sofiev 2026 的 D = λA + μ 画在同一张图上对照，这张图是简报里的科学核心。
- 一场火「至少被一颗看到」的概率 p\*\_i = 1 − ∏(1 − p\_is)，重叠期的真实火数用 Horvitz–Thompson 估计：Λ = Σ 1/p\*\_i。
- 模型一和模型二各自估计一次重叠期的火数，两者一致就是稳健性证据。

### 6. 模型三：推回 MODIS 年代，补上永远看不见的小火

2000–2011 年只有 Terra 和 Aqua。

```latex
\hat{\Lambda}_{g,t} = \underbrace{\sum_{i \in \text{MODIS}(g,t)} \frac{1}{\hat{p}_{i,\mathrm{MODIS}}}}_{\text{看得见但常漏}} \times \underbrace{\frac{1}{1-\phi_{\theta}}}_{\text{永远看不见}}
```

- 第一项：用重叠期学到的 MODIS 侦测曲线，给每个 MODIS 火点加权。
- 第二项：φ\_θ 是 FRP 低于 MODIS 侦测极限、但高于 VIIRS 极限的火占的比例，由重叠期 VIIRS 的 FRP 分布（截断幂律）按区域 × 月份估计。低于 VIIRS 极限的部分不外推，写明是下限。
- 假设：侦测曲线和 FRP 分布形状在 2000–2011 年和重叠期相同。用「留一年」验证检查它在重叠期内有多稳定。
- Terra 上午的数据用来估计「上午 vs 下午」的火数比例（日变化），供第 8 步积分用。

### 7. 日历输出（对应官方 Objectives）

| 指标 | 定义 | 对应官方要求 |
| --- | --- | --- |
| 协调火点数（主单位） | VIIRS 等效火点数 = Λ × 重叠期「每场火平均的 VIIRS 火点数 × VIIRS 侦测率」 | 「侦测到的火点数」，传感器来源不再重要 |
| 估计真实火数 | Λ，附 90% 区间 | 进阶视图 |
| 燃烧日数 | 格子当天「有在烧」的概率（占据模型思想） | 哪些时段火最多 |
| 月度异常 | 本月值与历年同月中位数的比例，以及「超过历史 90 百分位」的概率 | 与历史中位数、多年平均比较 |
| 关键期 | 每年累计到 50% 的日期、火季开始和结束周 | 关键时期 |
| 燃烧量和 PM2.5 | 见第 8 步，只在泥炭地显示 | 影响力层 |

### 8. 物理与化学层

1. FRP → FRE：用上午、下午、夜间三个时刻的估计拟合日变化，对一天积分。
2. FRE → 燃烧量：× 0.266–0.453 kg/MJ（卫星与野外系数范围），结果以范围呈现。
3. 燃烧量 → PM2.5：泥炭地 × 17.3 ± 6.0 g/kg。
4. 合理性检查：2015 年印尼泥炭火的文献值是 3.2–11 Tg PM2.5。

### 9. 网页应用

- **选区域：** 在地图上画矩形或多边形，或输入经纬度；也可以选州、省。
- **选日期范围：** 任意起止日期。
- **主视图：** 年 × 月热力日历（2000–至今），用无障碍顺序色阶（如 viridis）；异常模式用发散色阶；点任一格看每日曲线和区间。
- **「消失的火」开关：** 同一张日历在「原始 MODIS」「原始 VIIRS」「FireCensus」之间切换。
- **本月 vs 历史：** 一张卡片显示本月值、历史中位数和百分位。
- **下载：** 所选范围的原始火点 CSV、协调后的月度序列 CSV、日历 PNG。
- **方法页：** 侦测曲线对照图、验证结果、限制说明。
- **技术：** Python 离线计算所有 0.1° 格子的日序列，导出 Parquet / JSON；前端 Next.js + Tailwind + MapLibre，按所选格子即时汇总。

### 10. 验证清单

| 编号 | 实验 | 展示什么 |
| --- | --- | --- |
| E1 | 用 VIIRS 加上 MODIS 侦测曲线，预测 MODIS 会看到的火点数 | 比按月比例法更准 |
| E2 | 藏起一年 MODIS 再预测 | 区间覆盖率 |
| E3 | 2012 年变化点检验 | 假跳升消失 |
| E4 | 2015、2019 烟霾年 | 极端年被正确捕捉 |
| E5 | 合成数据（已知火数） | 模型能估回真值 |
| E6 | 抽掉一颗卫星 | 用其余卫星预测它 |
| E7 | 侦测曲线 vs Sofiev 2026 | 物理一致性 |
| E8 | 模型一 vs 模型二 | 两种方法估计一致 |

### 11. 10 页简报大纲

1. 开场：2026 年 11 月 1 日 S-NPP 停发，MODIS 2027 年停机，25 年火灾记录面临断层
2. 问题：原始曲线在 2012 年假跳升（一张图）
3. 为什么比例法不够：两颗卫星互相漏掉对方看到的火
4. 洞察：生态学家怎么数看不全的动物
5. 方法：捕获历史 → 多源估计 → 侦测曲线 → 推回过去（流程图）
6. 科学验证：侦测曲线 vs Sofiev 物理公式
7. 结果：协调后的 26 年日历，假跳升消失
8. 「消失的火」：东南亚旧记录低估了多少，以及对烟霾的意义
9. 网页示范：画区域 → 日历 → 本月 vs 历史 → 下载 CSV
10. 限制与下一步：下限性质、封闭性假设；可推广到全球、接入 Sentinel-3 和 JPSS-3

### 12. 3 分钟视频脚本

| 时间 | 画面 | 旁白要点 |
| --- | --- | --- |
| 0:00–0:25 | 2015 年烟霾中的吉隆坡、新山 | 我们生活在烟霾下，但记录本身有问题 |
| 0:25–0:55 | 2012 年假跳升曲线 | 换了卫星，数字就变，火并没有变多 |
| 0:55–1:35 | 数鱼动画 → 数火动画 | 捕获-再捕获的直觉 |
| 1:35–2:20 | 网页实操 | 画区域、看日历、切换「消失的火」、下载 |
| 2:20–2:45 | 侦测曲线对照图 | 从数据学到的曲线与物理公式吻合 |
| 2:45–3:00 | 结尾 | 卫星越多，我们看得越清楚 |

### 13. 48 小时计划（替代第五节旧版）

| 时间（马来西亚） | 任务 | 完成标准 |
| --- | --- | --- |
| 11/14 09:00–12:00 | 读入、过滤、过境重建、格网化 | 一张「原始叠加」时间序列图 |
| 11/14 12:00–16:00 | 配对聚类，生成捕获历史表 | 各种历史的火数表 |
| 11/14 16:00–20:00 | 模型一、模型二 | 侦测曲线图 + 重叠期 Λ |
| 11/14 20:00–11/15 01:00 | 模型三、验证 E1、E3、E5、E7 | 协调后 2000–至今序列 |
| 11/15 08:00–14:00 | 网页：地图、日历、异常、下载 | 可完整演示 |
| 11/15 14:00–16:00 | 物理化学层、E4 案例 | 烟霾图层 |
| 11/15 16:00–22:00 | 简报、视频、项目页、README | 全部交付物 |
| 11/15 22:00–23:59 | 检查、提交 | 提交成功截图 |

**时间不够时的砍法：** 先砍物理化学层和夜间捕捉窗，再砍 E4–E8。模型二、模型三和日历是底线，不能砍。

## 五、风险、规则与赛前准备清单

最急的一件事：S-NPP 数据 2026 年 11 月 1 日停止发布，历史档案之后还能不能下载尚不清楚。请先问 Local Lead：比赛前下载公开数据算不算「提前开工」。

### 风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| S-NPP 历史数据下载不到 | 重叠期只剩 2018 年起的 NOAA-20 | 用 NOAA-20；或者在规则允许下提前下载 |
| Sofiev 表格系数拿不到 | λ、μ 不准 | 用文中锚点拟合，并在重叠期微调 |
| 贝叶斯推断太慢 | 48 小时做不完 | 改用 Plan B（经验贝叶斯 + bootstrap） |
| 没有云的数据 | β 只能粗估 | 在限制里写明；有时间再加 MOD14A1 / VNP14A1 |
| 工业热源、火山混入 | 假火点 | 只用 FIRMS type = 0（植被火） |
| 一个人时间不够 | 视频和简报赶不出来 | 最后 6–8 小时只做展示材料 |
| 新山场地对全球开放 | 本地提名竞争大 | 靠 Creativity 和 Validity 拉开 |

### 规则

- 官网明说：比赛开始前不要开始做项目。读论文、设计方法、熟悉数据格式可以；写项目代码要等 11 月 14 日早上 9:00。
- 要拿全球奖必须用 NASA 数据；提交页和链接材料要用英文；所有外部资源列进 References。
- FIRMS 数据引用要按官方 DOI 格式写。

### 赛前准备（11 月 14 日前）

- [ ] 把官网题目页完整说明贴进第一节，确认官方列出的数据集
- [ ] 写信给 nasaspaceappchallengejb@gmail.com，问比赛前下载数据是否允许
- [ ] 申请 NASA Earthdata 账号和 FIRMS MAP\_KEY
- [ ] 精读 Sofiev & Kouznetsov 2026，拄下 Table 1–3 的系数
- [ ] 粗读 Schroeder 2014（VIIRS 375 m）和 Giglio 2016（MODIS C6）的算法部分
- [ ] 想清楚区域：中加里曼丹的边界和一个对照区
- [ ] 在纸上推一遍 Plan B 的公式
- [ ] 画好日历的线框图和 3 分钟视频的故事板
- [ ] 加入新山场地的 Telegram

### 48 小时时间表（马来西亚时间）

| 时间 | 任务 |
| --- | --- |
| 11/14 09:00–13:00 | 下载并清理 FIRMS 数据，格网化 |
| 11/14 13:00–20:00 | Plan B 跑通：拟合 θ、算 π、得到 Λ |
| 11/14 20:00–11/15 02:00 | 验证 E1–E3；有余力再上贝叶斯版 |
| 11/15 08:00–15:00 | 日历前端、「消失的火」图层、E4 案例 |
| 11/15 15:00–22:00 | 10 页简报、3 分钟视频、项目页 |
| 11/15 22:00–23:59 | 检查、提交（留一个小时缓冲） |

## 参考资料

**题目与规则**

- [PyroSync（引用官方目标）](https://github.com/moonmia207/PyroSync)
- [Judging & Awards Guide](https://spaceappschallenge.org/resources/judging-awards-guide)
- [VIIRS NOAA-20 375 m NRT（含 S-NPP 停发公告）](https://www.earthdata.nasa.gov/data/catalog/lancemodis-vj114imgtdl-nrt-2)
- [CAMS：Drifting away from MODIS](https://atmosphere.copernicus.eu/drifting-away-modis-cams-global-fire-assimilation-system)

**竞争队伍**

- [FireLens](https://github.com/shahmirkhan106/firelens) · [EarthGuard](https://github.com/ekosantoso/earth) · [FireCal](https://github.com/samuelakosaonyejekwe/firecal) · [EmberSync](https://github.com/Mosharrof8097/nasa_space_app_challange_2026) · [Vtheonly](https://github.com/Vtheonly/NasaSpaceApp2026) · [Kiln Watch](https://github.com/Aalvee-Aarham/kiln-watch) · [Emberline](https://github.com/AbhiramNimmala/Emberline) · [Flare-Chronos](https://github.com/the-aris-club/flare-chronos)

**科学文献**

- [Sofiev & Kouznetsov 2026, GMD — Observation operator and detection limits for MODIS and VIIRS FRP](https://gmd.copernicus.org/articles/19/10123/2026/)
- [Schroeder et al. 2014, RSE — The New VIIRS 375 m active fire detection data product](https://directreadout.sci.gsfc.nasa.gov/publications_documents/Schroeder_et_al_2014b_RSE.pdf)
- [Zhang et al. — MODIS vs VIIRS FRP 与视角](https://repository.library.noaa.gov/view/noaa/49896/noaa_49896_DS1.pdf)
- [Correction-before-fusion, Remote Sensing 2026](https://www.mdpi.com/2072-4292/18/10/1650)
- [Bias-corrected gridded FRP in GFAS, Remote Sensing 2019](https://www.mdpi.com/2072-4292/11/10/1205)
- [Chen et al. 2023 — GFED5 burned area](https://essd.copernicus.org/articles/15/5227/2023/)
- [Chen et al. 2026 — GFED5NRT](https://essd.copernicus.org/articles/18/7535/2026/)
- [Sperling, Wooster & Malamud 2020 — 像素大小与过境时间导致的 FRP 低估](https://nrfirescience.org/node/21297)
- [Roberts & Wooster 2008 — SEVIRI 火点与频率-强度分析](https://modarch.gsfc.nasa.gov/sci_team/pubs/abstract_new.php?id=01841)
- [Giglio, Csiszar & Justice 2006 — 火的全球分布与季节性](https://modis.gsfc.nasa.gov/sci_team/pubs/abstract_new.php?id=02543)
- [Atwood et al. 2016 — 2015 年印尼泥炭火](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4972419/)
- [Elvidge et al. — VIIRS 夜间识别泥炭闷烧](https://www.taylorfrancis.com/chapters/edit/10.1201/9780429022258-2/identification-smoldering-peatland-fires-indonesia-via-triple-phase-temperature-analysis-viirs-nighttime-data-christopher-elvidge-mikhail-zhizhin-kimberly-baugh-feng-chi-hsu)
- [SDSU 论文 — 印尼泥炭地火灾与传感器比较](https://openprairie.sdstate.edu/etd/5205)

**NASA 系统与演讲**

- [VIIRS Active Fire 产品页（VNP14 / VNP14IMG）](https://viirsland.gsfc.nasa.gov/Products/NASA/FireESDR.html)
- [FIRMS 字段说明](https://gee-community-catalog.org/projects/firms_vector/)
- [FEDS 火事件边界](https://gis.earthdata.nasa.gov/image/rest/services/FireTracking/Fire_Events_Data_Suite_Fire_Perimeters_NRT/MapServer/0)
- [Giglio 2025 — Terra/Aqua 轨道漂移](https://landweb.modaps.eosdis.nasa.gov/data/filePost/LANCE_UWG_Orbit_Drift_Giglio_202505.pdf)
- [Giglio, Roy, Randerson 2022 — MODIS Science Team](https://modis.gsfc.nasa.gov/sci_team/meetings/202211/presentations/giglioRoyRanderson.pdf)
- [Justice — Fire products overview](https://gslcluc1.umd.edu/sites/default/files/Chris_Justice_Fires.pdf)
- [Schroeder 2017 — GOFC Fire IT](https://gofcgold.umd.edu/sites/default/files/fireit_meetings/GOFC_Fire_IT_2017/day1/Schroeder.pdf)
- [GFED 实时系统（Andela）](https://tftei.citepa.org/images/files/2019-10-22-23-24/3.%20MARINELAND-UN-FIRE-WORSHOP-242019.pdf)
