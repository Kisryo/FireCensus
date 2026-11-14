# Prompt for Claude Code: Spline scene v4, "Explore on the globe"

Read these first. Do not contradict them:
- `docs/page-flow.md` (pages and flow)
- `docs/spline-v3-notes.md` (current scene build, frozen state, known Spline scripting pitfalls)
- `docs/spline-scene-report.md` (object and state names)

Scene: https://prod.spline.design/i6gXDIRfGjWXMnZA/scene.splinecode
Test with `web-test/spline-test.html?debug=1`. **Close the Spline editor before measuring FPS.**

## Goal
Normal users found it confusing to go from the 3D story page to a separate 2D Explore page. Explore will now happen **on the same globe**:
1. After the story, the globe zooms out to an overview with clickable region pins.
2. The user clicks a pin. The globe turns and the camera flies to that region.
3. The website shows an answer panel (charts and numbers) on the **left 40%** of the screen, over the scene.
   - That panel is React. **Do not build charts or numbers in Spline.**

## Do not break
- All existing object and state names, the `scene` variable, the Welcome/Focus_*/Story_* states and their behaviour.
- The fixes from v3: grey Terra and NOAA-21 copies, `?debug=1` keys, and object lookups done once at load.

## 1 · New `scene` values (same variable, string)
| Value | What the user sees |
|---|---|
| `Explore_Overview` | Globe centred slightly **right** (≈62% across the screen), Southeast Asia facing the camera, whole region visible. Satellites keep orbiting but small and dimmed to ~50%. No cones, no capture tags. All pins visible. |
| `Explore_indonesia` | Camera frames all of Indonesia (95–141°E, 11°S–6°N) in the **right 60%** of the screen |
| `Explore_borneo_sumatra` | Frames 95–120°E, 6°S–6°N |
| `Explore_mainland` | Frames 92–110°E, 10–24°N (Thailand, Myanmar, Laos, Cambodia) |
| `Explore_malaysia` | Peninsular + Malaysian Borneo |
| `Explore_brunei` | Brunei (close zoom) |
| `Explore_thailand` | Thailand |
| `Explore_myanmar` | Myanmar |
| `Explore_laos` | Laos |
| `Explore_cambodia` | Cambodia |

- Camera moves take about 1.2 s with ease-in-out.
- In every `Explore_<region>` state the selected region stays lit by the sun. Satellites go to 30% and move out of the right-hand frame.
- The left 40% of the screen must stay visually calm: dark space, no satellites, no labels.

## 2 · Clickable region pins
- One pin per region above, named exactly **`Pin_<regionId>`** (e.g. `Pin_indonesia`, `Pin_borneo_sumatra`).
- Place each pin at its region's centre, just above the cloud layer.
- **Look:** a small glowing ring (#FF6B35 core, soft halo) plus an English label (Indonesia, Borneo & Sumatra, Mainland SE Asia, Malaysia, Brunei, Thailand, Myanmar, Laos, Cambodia).
  - Labels face the camera, use the same font as the existing notes, and sit on a dark plate (#1A2336).
  - Text must be readable at 1440×900.
- **Overlap:** `Pin_indonesia` and `Pin_borneo_sumatra` overlap, so offset the labels so they don't collide. Mainland and the four mainland countries also overlap: in `Explore_Overview` show only the 3 group pins (indonesia, borneo_sumatra, mainland) plus malaysia. The country pins appear only in `Explore_mainland` and `Explore_indonesia`, where there is room.
- **Hover:** the pin scales ×1.25 and brightens, using a cheap scale/opacity change only.
- **Invisible hit area:** `PinHit_<regionId>`, about 2× the ring and fully transparent, like the existing `Hit_*`.
- **Selected state:** the selected region's pin stays bright. The other pins drop to 40%.
- **Click:** the scene sets `scene = Explore_<regionId>` itself, so it also works in the public link. The React side listens for `mouseDown` on `Pin_*` / `PinHit_*` too.

## 3 · Region highlight (optional, only if FPS allows)
A faint outline glow over the selected region, made from a flat textured decal (not geometry). Skip it if it costs more than 5 FPS.

## 4 · Fires on the globe
Keep the 90 real Sept-2019 fire points as they are (`FireGroup_A/B/C`). They are a visual hint only; the panel gives the real numbers. All fire groups stay visible in Explore states.

## 5 · Story → Explore handoff
`Story_Handoff` should now end looking like `Explore_Overview`, so the website can switch to Explore with no visible jump.

## 6 · Performance
- Desktop FPS must stay ≥ 45 in every Explore state, measured on the test page **with the Spline editor closed**.
- Do no per-frame object lookups (see the v3 notes).

## 7 · Test page
Add buttons to `web-test/spline-test.html` for every new `Explore_*` value. Log `mouseDown` targets so pin clicks are visible.

## Hand-back report
- A table of every new object and state name. The React side depends on these exact names.
- One screenshot per new state in `docs/screens/v4/`. Take them in the play/runtime view where possible; label editor-pose shots as such.
- FPS per Explore state.
- A list of what was confirmed vs not confirmed, kept separate as in earlier rounds.
