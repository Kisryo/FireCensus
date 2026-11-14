# Spline v3 — working notes

## Carry-over for Task 3 (from the user, 2026-11-09)

- Story_Scan today: Borneo sits on the **left edge** of the globe and the frame centre is the Pacific (see `screens/v3/task1_c_story_scan_check_rev2.jpg`).
- Task 3 must put **Borneo at the centre of the frame, on the lit side**, and the satellite staircase must **not cover any fire point**.
- Note: Story states turn the Earth to `HOME_YAW = 156.4` in the scene code; the Welcome yaw is now 178.4 and the sun comes from the upper left, so the Story camera and/or home yaw have to be re-chosen together with the light.

## Task 3 as built (2026-11-09)

| Layer | Satellite | Orbit radius | Colour | Cone base |
|---|---|---|---|---|
| 1 | Terra | 1.30 R = 533 | #B0BEC5 | MODIS 2330 km → 150 units |
| 2 | Aqua | 1.45 R = 594.5 | #FFB74D | MODIS → 150 |
| 3 | S-NPP | 1.62 R = 664.2 | #4FC3F7 | VIIRS 3060 km → 197 |
| 4 | NOAA-20 | 1.80 R = 738 | #64B5F6 | VIIRS → 197 |
| 5 | NOAA-21 | 1.98 R = 811.8 | #B39DDB | VIIRS → 197 |

R = 410 units = 6371 km. Info card line to add on the web side: *"Orbit heights are spread out for clarity. Real altitudes: Terra/Aqua ≈ 705 km, VIIRS satellites ≈ 824 km."*

- Story_Scan / Story_Zoom: Earth yaw 132.9° puts the Sumatra–Borneo fire cluster (mean of the 90 points) at the frame centre, on the sunlit side (cos to the sun ≈ 0.80). Camera comes in 44° oblique from the lower left, so higher layers appear further up-right and the staircase stays off the fire dots.
- Only Aqua, S-NPP, NOAA-20 cones light. Terra and NOAA-21 fade to 40% (NOAA-21's meshes have their own material copies `N21Mat_1..6` so S-NPP/NOAA-20 don't fade with it) and show notes `Note_Terra` / `Note_NOAA21` (English, because the site is English and the scene fonts have no CJK glyphs).
- Story_Zoom tags: 6 three-digit tags `Tag_<k>_<char>` under `FireTags`, (Aqua, S-NPP, NOAA-20) order, digits in the satellite's orbit colour, zeros at 40%: (1,1,1), (1,0,1), (0,1,0), (0,0,1), (0,0,0), (0,0,0). Tag anchors ≥ 26 units apart; other fires stay as dots.
- Debug number keys were removed from the Spline scene; `web-test/spline-test.html` and `FireCensusScene.jsx` enable keys 1–9 only with `?debug=1`, and never while typing in an input.

## Fix 2 as built (2026-11-09)

**Cones**
- Each cone uses its satellite's colour, with the body at 9% opacity.
- New objects `Foot_<sat>` (a 2-unit ring at 70%) and `FootFill_<sat>` (a 3% disc) sit under `OrbitSpin_<sat>` at x = 414 and mark the ground footprint.
- The light layer was removed from the cones, footprints, tag plates, leaders and ghost dashes. That 60% layer did not fade with alpha, and it was washing out the fires.

**Story_Zoom**
- The camera moved to (-409, -222, 469) → (-182, -20, 368), centred on the six tagged points.
- The satellites shrink to 0.001 so nothing covers the fires or tags.
- The cone bodies are hidden by a new `coneBody` channel; the footprints stay.
- `FireTags` now has rotation 0, so its local frame equals the `Earth_Group` frame. All tags are posed for an Earth yaw of 132.9.

**Tags**
- Font is JetBrains Mono Bold at scale 0.95, 2.2× the old size.
- Each tag has a `TagPlate_k` (#0B0F1A, 70%, rounded) and a `TagLead_k` (a 0.3-radius leader line, 60% white). Plates sit 70 units toward the camera; tag 5 sits 130 units out, scaled 0.76 so it looks the same size.
- Tuples and anchors: (1,1,1) Fire_A_05 · (1,0,1) Fire_A_09 · (0,1,0) Fire_A_18 · (0,0,1) Fire_A_14.
- Two ghost fires are tagged (0,0,0) with a second line `TagEst_k` reading "estimated". Each is drawn as 12 dashes (`GhostDash_k_01..12`, white 50%, ring radius 7.5). They sit on empty ground: ghost 5 is 26 units west of Fire_A_09 and ghost 6 is 26 units east of Fire_A_14 in screen-right direction, at least 18 units from any fire.

**Final touches (frozen 2026-11-09)**
- The ghost-tag second line reads `estimated` (no leading dot).
- `TagPlate_6` was changed to #1A2336 at 88% so it shows against space. The other plates sit over the Earth and stay #0B0F1A at 70%.
- The Spline scene is frozen. Only change it if web testing finds a problem.

**Haze**
- The `HazeSEAFeathered` image asset was replaced in the Spline UI with the PNG at max alpha 0.55.

**Re-measure**
- Story_Zoom adds about 38 small static objects and an HDRI. Cone and footprint writes now happen only when values change.
- If FPS drops below 50, first lower the cone segments or the bloom.

## Scene-scripting gotchas found during v3 (Spline MCP `run_code`)

- Alias calls inside `forEach`/arrow callbacks do not follow newly created objects: renames and transforms all land on the first object. Use plain `for` loops.
- After a transform on a new mesh, call `unselect()` before creating the next one; otherwise the next `mesh()` is not auto-selected.
- `moveInto` keeps world transforms, so an object moved into a scaled parent (e.g. `Sat_*` at scale 0.05) needs its scale divided afterwards.
- While the editor is in Preview/Play mode, edits do not stick — call `stop()` first.
- Per-object `color()`/`layer()` on an object linked to a shared material asset edits the ASSET (all users change). To give one object its own look, `createMaterial('<new name>', { layers: [...] })` + `applyMaterial` on it.
- `select(o => o.id === id)` inside a loop fails; `select('<id or name>')` works.

## FPS measured by user (2026-11-09, local Chrome, spline-test.html?debug=1, after Task 3)
| State | FPS |
|---|---|
| 1 Welcome | 55–65 |
| 7 Story_Scan | 53–58 |
| 8 Story_Zoom | 51–55 (lowest, closest to the 50 floor) |
| 9 Story_Handoff | 71 |
All states pass the ≥50 target. Story_Zoom has the least headroom: any Story_Zoom change (tag plates, outline rings) must not add per-frame work. Re-measure after the next revision.
Web side: add an adaptive fallback (if measured FPS < 35 for 3 s → turn off bloom/cloud rotation; on mobile → static poster image + 2D map).

## Fix 3 — after the first real web test (2026-11-10, Chrome, spline-test.html?debug=1)

The user measured on the real page: Story_Scan 54 FPS, Story_Zoom 48 FPS (below 50), Story_Handoff 83 FPS.

Three problems showed up only in the web runtime; the editor never showed them:

1. **Yellow jagged rim around the haze.**
   - Cause: `Haze_SEA` still had a physical light layer with bumpMapIntensity 5. The texture's alpha edge became bump relief, and sun and HDRI highlights lit it up.
   - Fix: removed the light layer. The haze is now a flat grey-brown at max alpha 0.55. This also removes an expensive shaded transparent pass over the whole sphere.
2. **Zeros and "estimated" nearly invisible.**
   - Cause: transparent sorting. A text object's origin sits about 70 units right of its glyph, so some plates were drawn over their text.
   - Fix: plates are now fully opaque #1A2336, zeros are solid #4D5766 (40% grey over the plate), and "estimated" is solid #C9D1D9. Nothing in a tag is transparent any more.
3. **Story_Scan English notes unreadable** (2.6 units tall).
   - Fix: note scale 0.42 → 1.8, centred 36 + 6·scale units under the satellite (controller change).

Cones were 512 triangles each; they are now 32 radial segments. That is negligible: Story_Zoom is fill-rate bound (clouds, haze, 3 atmosphere shells, bloom).

Next step if Story_Zoom is still below 50: turn bloom down or off. This needs the user's OK because fires lose their glow.

**Decision (user, 2026-11-10):** bloom stays on, because the fire glow is the core of the story.
- Story_Zoom at 45–50 FPS is acceptable.
- The web React layer will handle performance: during Story_Zoom it renders the canvas at 0.8× resolution, and it adds an automatic low-FPS fallback.
- The scene freezes once the user confirms on the test page that the yellow jagged haze edge is gone and the English notes are readable.

## Fix 4 — second web test (2026-11-10)

**Terra ghost**
- On the web, Terra never faded to 40%: the controller's runtime name lookup found no Terra meshes.
- All 24 Terra mesh ids are now hard-coded in `ghostMeshes`.

**Story_Scan notes**
- Size is now scale 1.08 (60% of 1.8). Each note sits on a new `NotePlate_Terra` / `NotePlate_NOAA21` plate (#1A2336, opaque).
- Each note is pushed from its satellite outward, away from Earth on screen, by 45 units plus half the plate.
- Each note is also pushed 60 units toward the camera, so it cannot cover the globe and orbit lines pass behind the plate.
- Both plates are hidden in the file; the controller shows them.

**Earth sun glint / blue ocean spot**
- Earth_Surface was physical, so it reflected the Studio-dark HDRI (the big blue spot).
- Phong was tried, but Spline's phong highlight blows out under bloom even with specular #0c0a08.
- Earth_Surface is now **lambert**: no HDRI reflection and no sun glint. A small warm glint would need a separate fake sprite (not built).

**Story_Zoom tags**
- All elements were scaled to 0.85 about each plate centre, and the leaders were recomputed.

**Per-state visibility**
- The controller now hides whole objects (`updateObject(..., {visible:false})`, written only on change):

| Object | Hidden when |
|---|---|
| `Orbit_*` | Story_Zoom |
| `Sat_*` | dim < 0.01 (Story_Zoom) |
| `Cone_*` | body off |
| `Foot*_*` | cone off |
| `Trail_*` | orbit speed 0 (Focus / Scan / Zoom) |
| `Hit_*` | Story_Scan and Story_Zoom |
| `FireTags` | outside Story_Zoom |
| `Note*` | outside Story_Scan |

## Fix 5 — Story_Scan notes and Terra fade (2026-11-10, after web_fix4 screenshots)

- **Story_Zoom is frozen.** This round touched only Story_Scan and the ghost fade.

**Screen positions in Story_Scan.** These were checked against the user's screenshot (canvas 1525×1030) by projecting the controller math. They match within a few pixels:

| Satellite | Screen position (px) |
|---|---|
| Terra | (1252, 519) |
| Aqua | (1329, 462) |
| S-NPP | (1425, 393) |
| NOAA-20 | (1538, 314) |
| NOAA-21 | (1662, 230) |

- The labelled screenshot is `screens/web/web_fix4_story_scan_annotated.png`.

**Notes**
- The old "outward from Earth" offset pointed up the staircase. Terra's note therefore landed on S-NPP, and NOAA-21's note went off screen.
- Now `NOTE_DIR` fixes the side in screen axes: Terra = (1, −0.5), down-right below Aqua's hanging panel; NOAA-21 = (−1, 0.2), to its left.
- The offset is 45 + half the plate width. Plates are pushed 120 units toward the camera so nearby orbit lines pass behind the opaque plate.

**Terra fade**
- The web screenshot shows Terra still solid.
- The ghost write now targets the 24 Terra meshes by id and by unique name.
- It sets both the material alpha and the colour-layer alpha.
- **Not yet confirmed on the web.**

## Fix 6 — final (2026-11-10). Spline scene FROZEN after this publish.

- **FPS.** The earlier drops (37 / 35 / 10) came from the Spline editor running alongside Chrome and competing for the GPU. With the editor closed, the page runs smoothly. Keep the editor closed when measuring.
- **Terra / NOAA-21 in Story_Scan.**
  - Runtime alpha on imported, asset-linked materials never took effect, so semi-transparency was dropped.
  - New objects `Sat_Terra_Ghost` and `Sat_NOAA21_Ghost` are duplicates of the satellites (hidden in the file). All 31 of their meshes use the new material `GhostGrey` (#5f6773, lambert, fresnel rim 0.1).
  - In Story_Scan the controller hides `Sat_Terra` / `Sat_NOAA21`, shows the grey copy and scales both to 60% (dim channel 0.6). This uses only show/hide, which is proven to work on the web.
  - The old `ghost` channel and the alpha writes were removed.
- **NOAA-21 note.** `NOTE_DIR.NOAA21` is now (−1, −0.5), left of and below the satellite, so it stays inside the frame top.
- **Lookups.** The controller resolves every object name → id once at load (`ID` map via `findObjectByName`). Per-frame writes go through `U(name)` → `updateObject(id)`. There are no name lookups inside the frame loop.
