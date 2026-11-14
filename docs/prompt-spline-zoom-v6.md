# Prompt for Claude Code: Spline scene v6, "Dive into the region"

Read these first. Do not contradict them:
- `docs/spline-scene-report.md` (object and state names, v4/v5)
- `docs/spline-v5-report.md`
- `docs/prompt-spline-explore.md` (v4: `Explore_*` states and pins)
- `web/app/page.tsx` and `web/components/RegionExplorer.tsx`, **read only**: what the website does after a region is picked

Project folder (this is now the only one we use): `D:\Hackerthon Project\FireCensus-public`. Work on git branch `Qi-Yuan`.
Scene: https://prod.spline.design/i6gXDIRfGjWXMnZA/scene.splinecode (keep this URL)
Backup first: save `FireCensus_backup_2026-11-14_v6.spline` in the project root.
Test with `web-test/spline-test.html?debug=1`. **Close the Spline editor before measuring FPS.**

## What the website does now (already built, do not change the web code)
In chapter 9 the visitor picks a region (pin click, or the list). Then:
1. The website sets `scene = Explore_<id>`.
2. It waits **1.5 s** for the Spline camera to arrive.
3. It fades in a real map (MapLibre globe projection with NASA Blue Marble imagery) **over the whole screen** for about 0.7 s.
   - The map starts as a whole globe centred on the region, then flies down onto the region.
   - Fire cells and 3D fire towers are drawn on that map.
4. "← Globe" removes the map and sets the scene back to `Explore_Overview`.

The handoff in step 3 is only seamless if the Spline globe at the end of `Explore_<id>` looks like the start of the map:
- the same region, in the middle of the screen, north up, not rotating;
- and close enough that the region is clearly the subject.

## Problem seen by the user (screenshot)
After picking **Borneo & Sumatra**:
- The Spline globe did **not** zoom in. It stayed at the overview distance with the whole Earth visible.
- The Earth faced the wrong way (India and Asia in front, Borneo small and low).
- The pins and the old left-panel layout are gone now, so the globe no longer needs to sit in the right 60%.

Find out why. Possible causes:
- the `Explore_<id>` transition is not triggered when `scene` changes from `Explore_Overview`;
- the Earth keeps auto-rotating and undoes the camera aim;
- the camera target is the old right-shifted pose.

Check every region, not only Borneo.

## 1 · Re-do the 9 `Explore_<id>` states as a "dive"
Ids: `indonesia`, `borneo_sumatra`, `mainland`, `malaysia`, `brunei`, `thailand`, `myanmar`, `laos`, `cambodia`.

For each one, at the end of the move:
- The region's centre (table below) is at the **centre of the screen** (50% across, 50% down), not on the right.
- **North is up.** Camera roll is 0, and the Earth's axis is vertical on screen.
- **Distance:** the region's box fills about 55–65% of the screen width at 1440×900. The curvature of the Earth must still be visible at the edges (we want "zoomed in on the planet", not a flat map).
- **Earth auto-rotation stops** in every `Explore_<id>` state, so the region stays put while the website fades in. Auto-rotation resumes in `Explore_Overview` and the story states.
- **Satellites and orbit lines** fade to 0% (or move far out of frame), so nothing pops when the map covers the globe.
- Clouds stay, at about 60%.
- **Pins:** only the selected pin, small. The others are hidden.
- **Timing:** the camera move takes **1.2 s** with ease-in-out, and must be finished by 1.4 s at the latest.

| id | centre (lon, lat) | box to frame (W, S, E, N) |
|---|---|---|
| indonesia | 118.0, -2.5 | 95, -11, 141, 6 |
| borneo_sumatra | 107.5, 0.0 | 95, -6, 120, 6 |
| mainland | 101.0, 17.0 | 92, 10, 110, 24 |
| malaysia | 109.5, 4.2 | 99.5, 0.8, 119.5, 7.5 |
| brunei | 114.7, 4.55 | 114, 4, 115.4, 5.1 (close zoom; frame about 4°, including northern Borneo) |
| thailand | 101.5, 13.0 | 97.3, 5.6, 105.7, 20.5 |
| myanmar | 96.7, 19.2 | 92.2, 9.8, 101.2, 28.6 |
| laos | 103.9, 18.2 | 100, 13.9, 107.7, 22.5 |
| cambodia | 105.0, 12.5 | 102.3, 10.4, 107.7, 14.7 |

**How to check the aim:** the Earth texture is equirectangular, so a (lon, lat) point maps to a known spot on the texture. Use the debug overlay or a temporary marker sphere at each centre and confirm it lands at screen centre. Remove the markers afterwards.

## 2 · `Explore_Overview` (back from the map)
- Globe centred on screen with Southeast Asia facing the camera.
- All pins visible, as in v4.
- Auto-rotation off while in chapter 9, so the pins don't drift away from the cursor.
- Satellites back to their v4 look.

## 3 · Do not break
- All object, state and variable names: `scene`, `Welcome`, `Focus_*`, `Story_*` (including v5's `Story_Fleet` and `Story_Example_*`), `Explore_Overview`, `Explore_<id>`.
- The v5 behaviour of the story states.
- The pin objects and the pin click (sets `scene = Explore_<id>`, only clickable in `Explore_*`).
- The `?debug=1` keys.
- Object lookups are done once at load.

## 4 · Performance
- Target 55+ FPS at 1440×900 in Chrome, with the Spline editor closed.
- No new lights, shadows or high-poly geometry.

## 5 · Test (both directions)
Do each of these, and save a screenshot of the end pose for every region in `docs/screens/v6/`:
- `Explore_Overview` → each of the 9 `Explore_<id>` states.
- `Explore_<id>` → `Explore_Overview`.
- `Explore_indonesia` → `Explore_mainland`, i.e. region to region directly.
- `Story_Example_Trend` → `Explore_borneo_sumatra`. This is a deep link; it has to end in the same pose.

## 6 · When done
1. Publish to the **same URL**.
2. Update `docs/spline-scene-report.md`.
3. Write `docs/spline-v6-report.md` with:
   - what caused the missing zoom;
   - the end pose of each region (screenshot paths);
   - confirmation that it is north-up, centred and not rotating;
   - the transition time;
   - FPS;
   - anything the website should change. **Do not edit the web code.** If the arrival time is not 1.2–1.4 s, tell me the real number so I can change the 1.5 s wait in `web/app/page.tsx`.
