# Spline v4 — Explore on the globe (2026-11-14)

Brief: `docs/prompt-spline-explore.md`. Scene URL unchanged: `https://prod.spline.design/i6gXDIRfGjWXMnZA/scene.splinecode`.
No existing object name, state name or the `scene` variable was renamed.

## New `scene` values

| Value | Camera framing | Pins shown (before the off-frame / far-side / left-40% filter) |
|---|---|---|
| `Explore_Overview` | Globe centre at 62% across, dist 1350, SE Asia (107°E, 6°N) facing the camera | indonesia, borneo_sumatra, mainland, malaysia |
| `Explore_indonesia` | bbox 95–141°E, 11°S–6°N in the right 60% | indonesia, borneo_sumatra, malaysia, brunei |
| `Explore_borneo_sumatra` | 95–120°E, 6°S–6°N | borneo_sumatra, indonesia, malaysia |
| `Explore_mainland` | 92–110°E, 10–24°N | mainland, thailand, myanmar, laos, cambodia |
| `Explore_malaysia` | 99.6–119.3°E, 0.8–7.4°N | malaysia, borneo_sumatra, indonesia |
| `Explore_brunei` | 114–115.4°E, 4–5.1°N (minimum camera distance 110 = close zoom) | brunei, malaysia, borneo_sumatra, indonesia |
| `Explore_thailand` | 97.3–105.6°E, 5.6–20.5°N | mainland + 4 countries |
| `Explore_myanmar` | 92.2–101.2°E, 9.8–28.5°N | mainland + 4 countries |
| `Explore_laos` | 100–107.7°E, 13.9–22.5°N | mainland + 4 countries |
| `Explore_cambodia` | 102.3–107.6°E, 10.4–14.7°N | mainland + 4 countries |

**Camera math** (controller `explorePose`):
- The Earth yaw turns the target longitude to azimuth −15°. The sun is at azimuth −55°, elevation 22°, so the framed region is lit (cos 0.69–0.79).
- The camera looks straight down the target's normal.
- The target sits at 70% of the screen width, the centre of the right 60%. Overview uses 62%.
- Distance fits the bbox into 60%·0.92 of the width and 90% of the height. It uses the live window aspect ratio, so the framing adapts to the React canvas.
- Moves take 1.2 s, ease-in-out.

**Other behaviour in Explore**
- Earth spin stops. Cones, tags and notes are off. All 90 fires stay on at full size.
- Orbit rings, trails and satellite hit spheres are hidden.
- Overview: satellites keep orbiting at 0.4× speed and 50% size. Any satellite whose screen x falls in the left 40% is hidden.
- Region states: satellites shrink to 30% and are then hidden.
- Clicking the Earth or the starfield no longer jumps to Welcome inside Explore. That rule moved from the `Click_Welcome` actions into the controller; outside Explore it behaves as before.

**`Story_Handoff`** now ends on the `Explore_Overview` pose:
- Same camera, Earth yaw, 50% satellites at 0.4× speed, and orbit rings hidden.
- All fire groups at full size (previously 0.9 / 0.8 / 0.2).
- Drag is now off in Handoff (it was on), so the switch to Overview cannot jump.

## New objects (under `Earth_Group > Pins`)

For each regionId in indonesia, borneo_sumatra, mainland, malaysia, brunei, thailand, myanmar, laos, cambodia:

| Object | What it is |
|---|---|
| `Pin_<id>` | Empty at the region centre, radius 416 (clouds are at 412.5), lying tangent to the globe. Hidden in the file; the controller shows it and scales it by camera distance ÷ 1000, so it stays the same size on screen. |
| `PinRing_<id>` | Glowing ring, #FF6B35, unlit. Has a `Hover` state: ×1.25, #FFA070. |
| `PinHalo_<id>` | Soft glow disc using the existing `FireMat_B` asset. Has a `Hover` state: ×1.25. |
| `PinHit_<id>` | Invisible hit sphere (radius 18 = 2× the ring, `HitMat`). Events: `PinHover_<id>` (MouseHover → Toggle the ring and halo `Hover` states, 180 ms) and `PinClick_<id>` (MouseDown → SetVariable `scene` = `"Explore_<id>"`). |
| `PinTag_<id>` | Empty holding the label; the controller billboards it toward the camera and offsets it to one side. |
| `PinPlate_<id>` | Label plate, #1A2336, opaque, rounded. |
| `PinLabel_<id>` | Label text, Space Grotesk 500 (same as the notes), scale 1.75 (~12 px cap height at 1440×900). |

**Pin behaviour**
- **Selected state:** the selected pin keeps full brightness. The others drop the ring to 40% alpha, hide the halo, and grey the label (#7D8693).
- **Label overlap:** each pin has a fixed label side. indonesia is down-right, borneo_sumatra up-left, mainland up, malaysia up-right, brunei down-right, thailand left-down, myanmar left-up, laos right-up, cambodia right-down.
- **Left 40%:** a label that would reach into the left 40% flips to the right.
- **Hiding:** pins on the far side of the globe, off frame, or with screen x in the left 40% are hidden.

## Skipped
- **Region highlight decal** (optional item 3). Not built: FPS can only be measured by the user with the editor closed, so it can be added later if there is headroom.

## Known limit
- **Left 40% in region views.** "The left 40% stays dark space" only holds in Overview. When zoomed into a region, the globe is larger than the screen, so the Earth's surface fills the left 40% behind the React panel. Satellites and labels are kept out of it.
- **Possible fixes, not built:**
  - a dark gradient behind the React panel;
  - a full-screen dark vignette layer in the Spline HTML overlay;
  - pulling the camera back so the whole globe stays in the right 60%, which makes small countries tiny.
