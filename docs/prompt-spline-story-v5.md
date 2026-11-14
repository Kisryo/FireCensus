# Prompt for Claude Code: Spline scene v5, "One story on one globe"

Read these first. Do not contradict them:
- `docs/page-flow.md` (pages and flow)
- `docs/spline-v3-notes.md` (current scene build, frozen state, known Spline scripting pitfalls)
- `docs/spline-scene-report.md` (object and state names)
- `docs/prompt-spline-explore.md` (v4: Explore_* states and pins, already built)
- `web/app/page.tsx` (the website story page that drives the scene)

Project folder: `D:\Hackerthon Project\FireCensus(private)`
Scene: https://prod.spline.design/i6gXDIRfGjWXMnZA/scene.splinecode
Backup before you start: save a copy as `FireCensus_backup_2026-11-14_v5.spline`.
Test with `web-test/spline-test.html?debug=1`. **Close the Spline editor before measuring FPS.**

## Goal
The website now tells **one continuous story** on one globe. The visitor scrolls through 9 chapters, and the website sets the `scene` variable for each one. The text and charts are React panels on the **left 40%** of the screen. The globe sits on the right and must move with the story.

Right now some chapters share a state (1 and 2 both use `Welcome`; 6, 7 and 8 all use `Explore_indonesia`). The globe sits still while the text changes, so it feels like two products glued together. Give every chapter its own camera move so the globe "turns the page" with the reader.

| Ch | Website text (short) | Scene now | Scene after v5 |
|---|---|---|---|
| 1 | Every dry season, smoke covers Southeast Asia | `Welcome` | `Welcome` (keep) |
| 2 | Five satellites, two generations | `Welcome` | **`Story_Fleet`** (new) |
| 3 | Each satellite misses fires the others see | `Story_Scan` | `Story_Scan` (keep) |
| 4 | We count fires the way ecologists count animals | `Story_Zoom` | `Story_Zoom` (keep) |
| 5 | One fire record, 2002–2026 | `Story_Handoff` | `Story_Handoff` (keep, ends like `Explore_Overview`) |
| 6 | Aug 2026 Indonesia: 106,253 fires, 2× a typical August | `Explore_indonesia` | **`Story_Example_Month`** (new) |
| 7 | When is the fire season? (Aug–Oct) | `Explore_indonesia` | **`Story_Example_Season`** (new) |
| 8 | The 2012 jump is the satellite, not the fires | `Explore_indonesia` | **`Story_Example_Trend`** (new) |
| 9 | Your turn: click a pin | `Explore_Overview` → `Explore_<id>` | keep (v4) |

## Do not break
- All existing object names, state names and the `scene` variable (string).
- `Welcome`, `Focus_*`, `Story_Scan`, `Story_Zoom`, `Story_Handoff`, `Explore_Overview` and all `Explore_<id>` states, with their current behaviour.
- The v3 fixes: grey Terra and NOAA-21 copies, `?debug=1` keys, object lookups done once at load.
- The v4 pins (`Pin_`, `PinRing_`, `PinHalo_`, `PinHit_`, `PinTag_`, `PinPlate_`, `PinLabel_`) and the pin click, which sets `scene = Explore_<id>`.
- **Layout rule for every state:** the left 40% of the screen stays dark and calm, with no satellites, labels or bright objects. The globe and its action sit in the right 60%.

## 1 · New states
All camera moves take about 1.2 s with ease-in-out, the same as v4. Each state must be reachable from **any** other state (people scroll both ways and jump with the chapter dots), so do not rely on the previous state.

### `Story_Fleet` (chapter 2)
- Same globe framing as `Welcome`, but the camera pulls back a little so all five orbits are visible.
- All five satellites are clearly visible, each with its existing name label.
- Show the two generations apart:
  - MODIS (Terra, Aqua) in a cool grey-blue tint.
  - VIIRS (S-NPP, NOAA-20, NOAA-21) in the brand orange #FF6B35.
  - Use a cheap material colour or emission change, no new geometry.
- One small floating caption near each group: "MODIS · 1 km pixels" and "VIIRS · 375 m pixels". Use the same font and dark plate (#1A2336) as the pin labels.
- No cones, no capture tags, no pins.

### `Story_Example_Month` (chapter 6)
- Camera frames Indonesia like `Explore_indonesia`, slightly closer on Sumatra and Kalimantan (about 98–118°E, 5°S–4°N).
- The existing fire points over Sumatra/Borneo glow brighter and pulse slowly (scale/opacity only).
- Show only `Pin_indonesia`, bright. All other pins are hidden.
- Satellites at 30% and outside the right-hand frame, the same as the v4 Explore states.

### `Story_Example_Season` (chapter 7)
- Camera pulls back about 25% from `Story_Example_Month` and tilts down a little so all of Indonesia and the Equator are visible. The feeling is "the whole season, not one month".
- Fire glow is calmer (pulse off, 70% brightness).
- `Pin_indonesia` is still visible. No other pins.
- Optional: a thin, faint arc or ring around Indonesia labelled "Aug – Oct". Skip it if it costs more than 3 FPS.

### `Story_Example_Trend` (chapter 8)
This chapter says that the jump in 2012 comes from a new satellite, not from more fires.
- Same framing as `Story_Example_Season`, but rotated about 15° so it looks like a new beat.
- Bring two satellites forward over Indonesia, in the right 60% of the screen:
  - Aqua (MODIS, grey-blue tint) on its orbit.
  - S-NPP (VIIRS, orange) on its orbit, with a short label "VIIRS · from 2012".
- The other three satellites go to 20%.
- `Pin_indonesia` is still visible. No other pins.

## 2 · Pin visibility by state
| State | Pins shown |
|---|---|
| `Welcome`, `Story_Fleet`, `Story_Scan`, `Story_Zoom` | none |
| `Story_Handoff` | fade in at the very end, the same as `Explore_Overview` (so chapter 5 → 9 has no jump) |
| `Story_Example_*` | `Pin_indonesia` only |
| `Explore_Overview`, `Explore_<id>` | as built in v4 |

- Pin clicks must do nothing outside the `Explore_*` states. The website only reacts in chapter 9, but the scene should not jump either.
- Implement the click guard in the scene event: if `scene` does not start with `Explore_`, ignore the click.

## 3 · Transitions to check by hand
Go through these in the test page, in both directions:
- `Story_Handoff` → `Story_Example_Month`: a smooth fly-in to Indonesia, not a cut.
- `Story_Example_Trend` → `Explore_Overview`: a smooth pull-back to the overview with all pins.
- `Explore_mainland` → `Story_Example_Month`: the visitor scrolls up from chapter 9 after choosing Mainland.
- `Welcome` ↔ `Story_Fleet`.
- Jump straight from `Welcome` to `Explore_cambodia` (simulates a deep link).

## 4 · Performance
- Target: 55+ FPS at 1440×900 in Chrome, Spline editor closed, on every new state.
- No new real-time lights, no new shadows, no new high-poly geometry. Re-use materials; tint with colour/emission changes.
- Look objects up once at load, as in v3.
- In `?debug=1`, add keys for the new states:
  - `f` → `Story_Fleet`
  - `m` → `Story_Example_Month`
  - `s` → `Story_Example_Season`
  - `t` → `Story_Example_Trend`

## 5 · When done
1. Export or publish the scene to the **same URL** (do not change the scene URL).
2. Update `docs/spline-scene-report.md` with the new states and objects.
3. Write `docs/spline-v5-report.md` with:
   - The exact new state names (case-sensitive) and confirmation that each is reachable from any state.
   - Which optional items you built or skipped (season arc).
   - FPS per new state with the editor closed.
   - Anything the website must change. The website will then switch chapters 2, 6, 7 and 8 to the new states and add them to `STATES` in `web/components/SplineScene.tsx`. **Do not edit the web code yourself.**
