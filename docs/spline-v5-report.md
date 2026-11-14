# Spline v5 report — one story on one globe (2026-11-14)

Brief: `docs/prompt-spline-story-v5.md`.

**Scene URL**
- Unchanged: `https://prod.spline.design/i6gXDIRfGjWXMnZA/scene.splinecode`. Both the code export and the public link were republished.
- Public link: `https://my.spline.design/untitled-ce1lvjzdREGea8mWjuKukZ8w/`.

**Backup:** `FireCensus_backup_2026-11-14_v5.spline` in the project root (8.4 MB), saved before any change.

**Unchanged:**
- All object names, state names and the `scene` variable.
- The behaviour of `Welcome`, `Focus_*`, `Story_Scan`, `Story_Zoom`, `Explore_*`.
- The v3 fixes: grey Terra / NOAA-21 copies, `?debug=1` keys, one-time object lookup.

**Web code:** not edited.

## 1 · New states (exact, case-sensitive)

| State | Chapter | What it does |
|---|---|---|
| `Story_Fleet` | 2 | Welcome's view direction, pulled back to 2300 so all five orbits fit, globe centre at 66% across. Satellites park round the globe in the right 60% at 2.4× size, each with its name label. MODIS (Terra, Aqua) orbit rings, labels and rim glow are grey-blue #86A6D8; VIIRS (S-NPP, NOAA-20, NOAA-21) are orange #FF6B35. Captions "MODIS · 1 km pixels" and "VIIRS · 375 m pixels" on #1A2336 plates. No cones, no tags, no pins. The Earth keeps spinning. |
| `Story_Example_Month` | 6 | Sumatra + Kalimantan (centre 108°E, 0.5°S) at 80% of the `Explore_indonesia` distance. All 90 fire points at 1.3× with a slow pulse (±12%, 2.4 s, scale only). Only `Pin_indonesia`, bright. Satellites shrink to 30% and are hidden. |
| `Story_Example_Season` | 7 | 25% further out than Month (= the `Explore_indonesia` distance), centred on all of Indonesia (118°E, 2.5°S). The camera tilts down 8° from the north, so all of Indonesia and the Equator show. Fires at 70%, no pulse. Only `Pin_indonesia`. |
| `Story_Example_Trend` | 8 | Season's globe with the camera swung 15° west. Aqua and S-NPP park in front of the globe above Indonesia (screen 60% / 22% and 86% / 20%), sized to about 12% of the screen height, with their name labels in generation colours, plus the caption "VIIRS · from 2012" under S-NPP. The other three satellites go to 20% and are hidden if they fall in the left 40%. Fires at 70%. Only `Pin_indonesia`. |

**Reachable from any state.** Every state is computed in `enter()` from the current values, never from the previous state:
- The camera, Earth yaw, satellite node / phase and all fades are tweened from wherever they are.
- Earth yaw and satellite phase take the shortest way round.
- Camera moves take 1.2 s, ease-in-out.
- The code paths cover all of these. **They have not been checked by eye in the browser yet** (see §5).

**Other changes**
- **Pins by state:**

  | State | Pins |
  |---|---|
  | `Welcome`, `Story_Fleet`, `Story_Scan`, `Story_Zoom` | none |
  | `Story_Handoff` | the `Explore_Overview` four (indonesia, borneo_sumatra, mainland, malaysia), growing in over 0.5 s after the camera arrives (1.1 s delay) |
  | `Story_Example_*` | `Pin_indonesia` |
  | `Explore_*` | as in v4 |

- **Click guard.** In this Spline version, a Conditional action cannot compare text values and cannot take child actions through the editor API. I tried it and reverted it.
  - So the guard is done with the hit areas instead. Outside `Explore_*` the controller hides every `PinHit_<id>`, the invisible click/hover sphere, while the ring and label stay visible. A pin there cannot be clicked or hovered, so nothing jumps.
  - In `Explore_*` the hit spheres are on, and the existing `PinClick_<id>` SetVariable works as in v4.
- **Generation tint.** This is a runtime colour change only, with no new geometry and no new lights:
  - Orbit ring colour and emissive, name-label colour and emissive, and the satellites' fresnel rim (colour, alpha 30 → 85).
  - The originals are restored when leaving `Story_Fleet` / `Story_Example_Trend`.
  - Colour writes on the NASA satellites' shared material assets were tested in the runtime and work. Only alpha writes failed in v3.

## 2 · Optional items
| Item | Status |
|---|---|
| Season "Aug – Oct" arc around Indonesia | **Skipped.** FPS cannot be measured from my side (the editor must be closed). It can be added later as one flat ring and label if Season has more than 3 FPS headroom. |

## 3 · New objects
| Object | Where | Notes |
|---|---|---|
| `Caption_MODIS`, `Caption_VIIRS`, `Caption_VIIRS2012` | scene root | Empty + `CaptionPlate_<x>` (#1A2336, rounded) + `CaptionText_<x>` (Space Grotesk 500, same as the pin labels). Hidden in the file. The controller places them at a fixed screen spot and a constant on-screen size. |

No other geometry, lights or materials were added.

## 4 · Performance
- No new lights, shadows or high-poly geometry. The three captions are two flat objects each.
- Per frame, v5 adds:
  - Fleet / Trend: at most five label-scale writes and three caption writes.
  - Month: the fire pulse rewrites the 90 fire discs only when the scale has moved by more than 0.02, which is roughly every few frames.
- The generation tint is written only when the tint mode changes, not every frame.
- All object lookups are still done once at load.

**FPS per new state (Chrome, 1440×900, editor closed): NOT MEASURED.** This needs the editor closed, which I cannot do from here. The target is ≥ 55.

## 5 · Confirmed vs not confirmed

**Confirmed (Spline runtime / play view; the preview window was about 1.19:1, so framing at 1440×900 differs a little):**
- `Story_Fleet`
  - Screenshot: `screens/v5/v5_story_fleet_runtime_draft.jpg`.
  - The globe sits to the right; MODIS orbits are grey-blue and VIIRS orbits orange; both captions show; satellites park round the globe.
  - This shot was taken **before** the last tweaks: satellites 1.5× → 2.4×, labels 3× bigger, VIIRS caption moved off the globe to the top right (0.86, 0.12), MODIS colour slightly bluer. Those tweaks are not re-shot.
- `Story_Example_Month`
  - Screenshot: `screens/v5/v5_story_example_month_runtime.jpg`.
  - Sumatra and Kalimantan are framed, fires bright, only the Indonesia pin, no satellites.
- `Story_Example_Season`
  - Screenshot: `screens/v5/v5_story_example_season_runtime.jpg`.
  - All of Indonesia and the Equator show, fires calmer, only the Indonesia pin.
- `Story_Example_Trend`
  - Screenshot: `screens/v5/v5_story_example_trend_runtime_before_15deg_fix.jpg`.
  - Aqua and S-NPP are in front above Indonesia with grey-blue / orange labels; the "VIIRS · from 2012" caption and the Indonesia pin show.
  - **This shot is from before a fix.** I first rotated the Earth and the camera together, so the view looked the same as Season. Now the Earth keeps Season's orientation and only the camera swings 15° west. The fixed angle is not re-shot.
- **Runtime colour changes work** on orbit rings, labels and satellite meshes (tested in Focus_Aqua).

**Not confirmed:**
- **FPS** of every new state.
- **Transitions** on the test page (Handoff → Month, Trend → Explore_Overview, Explore_mainland → Month, Welcome ↔ Fleet, Welcome → Explore_cambodia jump). No visual check yet.
- **Rim tint** (fresnel write) on the satellites. Too small to judge at Fleet distance.
- **Pin label and caption brightness** in the Example states: they looked slightly grey in the captures, possibly mid fade-in.
- **Pin click guard:** never clicked in the browser.
- **Handoff pin fade-in** at the end of chapter 5: never seen.
- **Left 40% in region views:** the Earth surface fills it in the Example states as in v4 (globe larger than the screen). Satellites, labels and captions are kept out of it. This is a known limit; the React panel background (dark gradient) is the suggested fix.

## 6 · What the website must change (web code not touched)
1. **`web/app/page.tsx`, `CHAPTERS`:**
   - chapter 2 `scene: "Welcome"` → `"Story_Fleet"`
   - chapter 6 `"Explore_indonesia"` → `"Story_Example_Month"`
   - chapter 7 → `"Story_Example_Season"`
   - chapter 8 → `"Story_Example_Trend"`
2. **`web/components/SplineScene.tsx`:**
   - Add `"Story_Fleet"`, `"Story_Example_Month"`, `"Story_Example_Season"`, `"Story_Example_Trend"` to `STATES` (and the comment on line 2).
   - If you want the same debug letters as the test page, map `f` / `m` / `s` / `t` to those four under `?debug=1`.
3. **Pin clicks.** The page's listener (`page.tsx` ~line 180) only acts on `Explore_<id>`, and pins are only clickable in `Explore_*`, so nothing else is needed.
4. **Recommended:** a dark gradient behind the left-40% panel. In region and Example views the globe fills the screen behind it.

## 7 · Test page
`web-test/spline-test.html` (both project copies):
- new "Story（v5）" buttons;
- `?debug=1` letter keys `f` → `Story_Fleet`, `m` → `Story_Example_Month`, `s` → `Story_Example_Season`, `t` → `Story_Example_Trend`, ignored while typing in a field, as the number keys are.
