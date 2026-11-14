# Spline 场景完成报告（Claude Code，2026-11-08）

The free Spline plan won't allow duplicating the file. I'll save the backup as a local .spline file instead.

Backup saved (`FireCensus_backup_2026-11-08.spline`, 6 MB). Now loading Spline's guides for code-driven motion and events.

Backup done. Before building, I'll test the riskiest part: whether the scene's code layer receives mouse drags (needed for "drag to rotate Earth" without Spline's own camera controls).

Still testing whether Spline's code layer can see mouse drags; the console isn't visible, so I'll have the script write its results into a scene variable I can read.

Still checking the input: runtime values don't show in the scene readout, so I'll test visibly instead. A drag should turn the globe.

Spline doesn't pass raw mouse drags to the script, so "drag to rotate" will use its built-in rotate control with zoom and pan off. Next I'm checking whether code can move the camera while that control is on, and whether a click can set the `scene` variable.

Neither the camera move nor the drag worked, so first I'm checking whether the script runs in this preview at all.

Progress note: the code layer doesn't seem to run in this preview. I'm checking with Spline's own play-mode capture before deciding how to build the motion.

The live capture confirms the script runs in Spline's real runtime, just not in the desktop preview. I'm publishing a short probe to test mouse input in the browser next.

The test page loads but shows only the background, so I'm checking whether this browser pane can render 3D at all.

The browser pane can't run Spline's 3D, so I'll build on verified parts and leave the interaction test to you at the end. I'm now working out where the satellites should stop over Borneo so each fire sits under the right number of scan cones.

An exact split is possible: 12 fires sit under two or more cones, 10 under exactly one, and 8 under none. I'm regrouping the fires to match and computing each one's 5-digit tuple next.

The split works, but most fires end up seen only by NOAA-20 and NOAA-21. I'll refine the search so every satellite covers a fair share of Borneo and the tuples vary more.

With a 26-unit footprint, each satellite covers at least 5 fires and there are 12 different tuples. Recomputing the regrouping with these values.

Coverage is set. Now cleaning out the old Stage1–5 machinery, because its state animations override the new code (that's what broke the camera test).

Removing states by name works, but events need ids, so I'll rebuild the cones, haze, fire groups and satellites group and remove events only on the ones I keep.

Old system removed. Now restructuring: new `Satellites` group, Earth moved to the orbit center, renames.

Now regrouping the fires so each group matches its real cone coverage.

Fires are regrouped. Now lowering the orbits to 0.16–0.25 Earth radii, shrinking the satellites, and adding cones, hover glow, labels, trails and invisible click targets for all five.

Still in play mode, and the orbit rings came out as thick cyan plates. Stopping play and checking the ring shape settings.

Rings and fires are aligned: Borneo is centered with its fires, and the satellites now sit close to Earth. Next come the atmosphere, the star field and the new haze.

Stars and atmosphere are in. Next, the haze over Borneo and Sumatra.

Haze is in. Now wiring the hover effect (cyan glow and label) and the clicks.

Hover actions point at the right objects but haven't picked up the "Hover" state yet. Fetching the state ids to link them.

That works. Applying the same link to the other four satellites.

Hover and click wiring is done for all five. Next: the tuple tags such as (1,1,1,1,1) next to 9 representative fires, which appear in Story_Zoom.

All scene objects are built. Now the main piece: the code that runs every state, the motion (orbits, Earth spin, the 0.3 s ease-to-stop), the camera, cones, fires and labels.

The controller script is in. Creating the drag variables, then testing each state in Spline's live play view.

Welcome state works: Earth centered on Borneo with fires, haze, atmosphere rim and orbiting satellites. But the star background renders grey instead of deep blue-black. Fixing the star layers.

Found it: the twinkle layer caused the grey. The background is the correct deep blue-black now. I'll replace that layer with 24 small stars that the code twinkles individually.

Now testing the states one by one, starting with Story_Scan, where the cones and fire lighting should match.

The script responds (the camera moved to the mid shot), but the satellites didn't park over Borneo and the cones stayed off. Adding a temporary on-screen debug readout to find out why.

The live capture renders after load, so the animations were caught mid-way, not broken. I'm speeding transitions up 50× for testing, then restoring the real timings.

Story_Scan's pose now works, with Earth turned home and the five satellites over Borneo, but the cones are seen end-on from straight ahead. I'm reshooting Story_Scan and Story_Zoom from an oblique angle with slightly smaller satellites.

The satellites now sit over Borneo, but their cones have vanished, so I'm dropping visibility toggles and controlling them by transparency alone, then rechecking.

I've hit my screenshot limit, so I can't capture more play frames. I'm now restoring real timings, removing the debug readout, hiding cones by default, and setting the start state to Welcome, followed by a performance check and exports.

The scene is light on polygons (~112k) and lights, but heavy on materials (107). I'll merge identical materials: stars, click targets, glows, labels, tags, and NASA's duplicate gold-foil/metal pairs.

Materials are down from 107 to 61. Polygons (~112k), one light and one effect are fine for a laptop. Publishing the React code export and updating the public link.

The Welcome overview frames correctly; the darkness reads as intended from the #0B0F1A background, with the satellites kept small on purpose for the wide shot. I'm writing the React integration snippet next.

按你确认的计划做完了，链接已更新。有一点要先说：鼠标交互和大部分状态的动画我这边没能实际跑起来看。Spline 的播放截图只拍得到载入后一瞬间，我也已经用完了截图次数；内置浏览器又打不开 Spline 的 3D 页面。实际看到的只有两样：Welcome 远景画面，以及 Story_Scan 中卫星停到婆罗洲上空的位置，而那时光锥还没显示出来。所以请你先打开链接实际测一遍。

**导出链接**
- React 用的 scene URL：`https://prod.spline.design/i6gXDIRfGjWXMnZA/scene.splinecode`
- 公开预览：https://my.spline.design/untitled-ce1lvjzdREGea8mWjuKukZ8w/
- React 接入示例：[FireCensusScene.jsx](FireCensusScene.jsx)，包含状态切换、点击回传和拖拽转地球。

## 1. 物件清单（按群组）

- **Earth_Group**
  - Earth_Surface、Earth_Clouds、Earth_Atmosphere
  - Haze_SEA（内含 Haze_SEA_01–05）
  - FireGroup_A：Fire_A_01–12
  - FireGroup_B：Fire_B_01–10
  - FireGroup_C：Fire_C_01–08
  - FireTags：9 个元组标签，名字是 Tag_Fire_A_01 这类
- **Satellites** → 每颗卫星一个倾斜轨道面 OrbitPlane_\<名\>，里面有：
  - 细轨道环 Orbit_\<名\>
  - 绕行物件 OrbitSpin_\<名\>，内含 Sat_\<名\>、Cone_\<名\>、Trail_\<名\>、Hit_\<名\>（隐形点击区）、Glow_\<名\>（悬停光晕）、Label_\<名\>（内含 LabelText_\<名\>）
  - \<名\> 是 Terra、Aqua、SNPP、NOAA20、NOAA21
- **背景**：Stars_Far（星空球），以及 Stars_Twinkle（Star_01–24，会闪烁）
- **其他**：MainCamera、Sun Light

几点说明：
- 30 个火点按光锥的真实覆盖重新分了组。Story_Scan 时卫星停在婆罗洲上空，A 组 12 个正好落在 2 道以上光锥下，B 组 10 个只在 1 道下，C 组 8 个不在任何光锥下。也就是说，部分火点的编号和以前不同了。
- 轨道半径降到地球半径的 0.16–0.25 倍。

## 2. 状态和镜头

状态由变量 `scene` 控制，网页调用 `setVariable('scene', '状态名')` 切换：

| 状态 | 镜头 | 其他变化 |
|---|---|---|
| Welcome | 正前方远景，距离约 2100 | 地球自转，卫星绕行 |
| Focus_\<名\> | 停在该卫星外侧斜上方，看向卫星，地球在后面 | 卫星和地球约 0.3 秒缓停，该卫星光锥亮起，其他卫星缩小变暗 |
| Story_Scan | 右上方斜角中景 | 地球转回婆罗洲朝前；5 颗卫星停到婆罗洲上空，光锥依次打开。约 2.3 秒后 A 组亮起，2.9 秒后 B 组亮起，3.6 秒时 C 组闪一下就暗掉 |
| Story_Zoom | 斜角近景拉到婆罗洲 | 浮现 9 个元组标签 |
| Story_Handoff | 地球居中、略微俯视 | 卫星以四成速度继续绕行 |

所有过渡都在 0.3–1.5 秒之间，用 ease-in-out。运动由场景里的一段代码驱动，我确认过它在 Spline 的真实运行环境中会执行。

## 3. 事件
- **悬停卫星**（Hover_\<名\>）：青色光晕和标签以 0.22 秒淡入，移开后恢复。
- **点击卫星**（Click_\<名\>）：把 `scene` 设为 `Focus_<名>`。
- **点击地球或星空**（Click_Welcome）：回到 Welcome。
- **拖拽**：转动地球和卫星。
- **滚轮**：已关闭缩放。

## 4. 还没做完或做不到的

- **都没实际看过运行**：悬停、点击、拖拽，以及 Focus、Zoom、Handoff 三类状态。Story_Scan 只看到了卫星停位，光锥还没亮出来。我修改过光锥的淡入写法，但没能再看一次确认。
- **拖拽转地球需要网页配合**：Spline 场景里的代码收不到鼠标拖拽事件，所以由 React 端设置 `dragYaw` 和 `dragPitch` 两个变量来实现，示例文件里已写好。
- **Earth_NightLights 没做**：Spline 做不出只在背光面亮的效果。
- **其他卫星「变暗」**：是用缩小来表现的，因为 NASA 模型的材质是 5 颗卫星共用的，没法单独调暗。
- **元组只标了 9 个火点**：每组 3 个代表，例如 (1,1,1,1,1)、(1,0,0,0,0)、(0,0,0,0,0)。
- **材质数量**：从 107 降到 61，但仍偏多，主要来自 NASA 模型。另外三角面约 11 万、1 盏灯、1 个后期效果，笔电应该没问题，但没实测帧率。
- **网页代码要更新**：旧的 `stage` 变量和按键 1–5 已经删除，网页里原来的 `setVariable('stage', N)` 不再有作用。
- **备份方式改了**：免费版 Spline 不允许复制文件，所以备份另存成了本机文件 `FireCensus_backup_2026-11-08.spline`，放在这个 session 的文件夹里。
---

## Update 2026-11-14 — v4 (Explore) and v5 (one story on one globe)

Details: `docs/spline-v4-notes.md` and `docs/spline-v5-report.md`. No existing object name, state name or the `scene` variable was renamed.

### States (`scene` values, string, case-sensitive)
| State | Chapter | Since |
|---|---|---|
| `Welcome` | 1 | v1 |
| `Story_Fleet` | 2 | **v5** |
| `Story_Scan` | 3 | v1 |
| `Story_Zoom` | 4 | v1 |
| `Story_Handoff` | 5 (ends on the `Explore_Overview` pose; pins fade in at the end) | v1, changed v4/v5 |
| `Story_Example_Month` | 6 | **v5** |
| `Story_Example_Season` | 7 | **v5** |
| `Story_Example_Trend` | 8 | **v5** |
| `Explore_Overview`, `Explore_<id>` | 9 | v4 |
| `Focus_Terra` / `_Aqua` / `_SNPP` / `_NOAA20` / `_NOAA21` | satellite click | v1 |

### Objects added since v3
| Object | Where | Purpose |
|---|---|---|
| `Sat_Terra_Ghost`, `Sat_NOAA21_Ghost` | inside `OrbitSpin_Terra` / `OrbitSpin_NOAA21` | Grey 60% copies shown in Story_Scan (v3 fix 6) |
| `NotePlate_Terra`, `NotePlate_NOAA21` | inside `OrbitSpin_Terra` / `OrbitSpin_NOAA21` | Dark plates behind the Story_Scan notes |
| `Pins` > `Pin_<id>` > `PinRing_<id>`, `PinHalo_<id>`, `PinHit_<id>`, `PinTag_<id>` > `PinPlate_<id>`, `PinLabel_<id>` | under `Earth_Group` | Region pins (v4). Events `PinHover_<id>` and `PinClick_<id>` are on `PinHit_<id>`. |
| `Caption_MODIS`, `Caption_VIIRS`, `Caption_VIIRS2012`, each with `CaptionPlate_<x>` and `CaptionText_<x>` | scene root | v5 captions: "MODIS · 1 km pixels", "VIIRS · 375 m pixels", "VIIRS · from 2012" |

`<id>` is one of: indonesia, borneo_sumatra, mainland, malaysia, brunei, thailand, myanmar, laos, cambodia.

### Events changed
- `Click_Welcome` on `Earth_Surface` and `Stars_Far` no longer holds a SetVariable action. It is a sensor now, and the controller returns to `Welcome` on that click except in `Explore_*` states (v4).
