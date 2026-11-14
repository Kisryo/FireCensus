# Credits — imagery and 3D models

All Earth imagery and satellite models in the FireCensus Spline scene are NASA public-domain material.
NASA asks that Blue Marble imagery be credited to **NASA Earth Observatory**.

## Earth textures (Spline scene v3, Task 1)

| Use in scene | File in `assets/textures/` | Source (NASA) | Processing |
|---|---|---|---|
| Day surface (`Earth_Surface` texture) | `earth_day_bmng_200408_4096.jpg` | Blue Marble: Next Generation w/ Topography, **August 2004** (`world.topo.200408.3x5400x2700.jpg`). NASA Earth Observatory / Reto Stöckli, NASA GSFC. https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/ | Resized 5400×2700 → 4096×2048, JPEG q88. August chosen because it is Borneo's fire season. |
| Clouds (`Earth_Clouds`, ~55% opacity) | `earth_clouds_bm_2048.png` | The Blue Marble cloud composite (`cloud_combined_2048.jpg`). NASA Earth Observatory, MODIS imagery. https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/ | Brightness used as alpha; RGB set to white; 2048×1024 PNG. |
| Ocean gloss (roughness map on `Earth_Surface`) | `earth_roughness_mask_2048.png` | Derived from the Blue Marble Next Generation GEBCO topography map (`gebco_08_rev_elev_5400x2700.jpg`). https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/ | Land (elevation > 0) = 255, ocean = 80 → ocean roughness ≈ 0.31, land ≈ 1.0. 2048×1024. |
| Terrain relief (bump map on `Earth_Surface`) | `earth_bump_gebco_2048.jpg` | Same GEBCO topography map as above. | Greyscale elevation resized to 2048×1024; bump intensity 1.2 (kept low). |

Original downloads are kept in `assets/nasa_src/`.

The smoke haze over Sumatra and Borneo (`Haze_SEA`) uses `assets/textures/haze_sea_feathered_055_2048.png`. We drew it ourselves; it is not NASA imagery. It is a feathered grey-brown alpha mask with maximum opacity 0.55, and it replaced the 0.42 version in fix 2.

Night lights (Black Marble) were **not** added — see the Task 1 report for why and the alternatives.

## Satellite models (Task 2)

All from **NASA 3D Resources** (public domain), GitHub `nasa/NASA-3D-Resources`, folder `3D Models/`.

| Scene object | NASA model | Processing |
|---|---|---|
| `Sat_Terra` | `Terra/Terra.glb` | Reduced to 13,463 triangles. NASA's file references two missing solar-panel images; Aqua's solar-cell image (same NASA set) was embedded in their place. |
| `Sat_Aqua` | `Aqua (A)/Aqua (A).glb` | Reduced to 13,325 triangles. |
| `Sat_SNPP` | `Suomi National Polar-orbiting Partnership (Suomi NPP)/…glb` | 4,024 triangles, unchanged. |
| `Sat_NOAA20`, `Sat_NOAA21` | Same Suomi NPP model | **Illustrative model based on S-NPP** — NASA has no separate NOAA-20/21 model; both use the JPSS/S-NPP spacecraft design. Distinguished by solar-array tilt (+28° / −28°) and a colour badge (NOAA-20 #64B5F6, NOAA-21 #B39DDB). The info card must say so. |

**Info-card renders** (`assets/renders/sat_terra.jpg`, `sat_aqua.jpg`, `sat_snpp.jpg`, 1600×1000): rendered by us in Blender 5.2 Cycles (`assets/renders/render_sat.py`, v2) from the full-resolution NASA GLBs above, with the NASA Blue Marble NG August 2004 map on the Earth limb (turned to show Sumatra and Borneo). The geometry is NASA's; the v2 materials are ours, replacing NASA's by material name: procedural crinkled gold MLI (#C9A045, metallic), procedural blue-violet solar cells (#1A2350) with a silver grid, white radiators (#E8EAED) and black parts (#111316). Lighting is a key sun, a cool rim light and a faint fill, plus a bloom pass. The v1 renders are kept as `*_v1_old.jpg` for comparison. NOAA-20/21 cards reuse `sat_snpp.jpg` and must say "illustrative, based on S-NPP".

Render commands (yaw, samples, tilt, roll):
`blender -b -P render_sat.py -- models/Terra_fixed.glb <earth.jpg> sat_terra.jpg 115 128 0 -72` ·
`… models/Aqua.glb … sat_aqua.jpg 115 128 0 107` · `… models/SNPP.glb … sat_snpp.jpg 115 128 0 107`

**In-scene satellite textures** (made by us, not NASA imagery): `assets/textures/sat_mli_foil_normal_1024.jpg` (procedural crumpled-foil normal map) and `sat_solar_cells_1024.jpg` (procedural solar-cell grid). Environment reflections use Spline's built-in "Studio dark" HDRI (lighting only, background hidden).

Materials were changed to PBR: gold thermal foil (metalness 0.9, roughness 0.35), deep-blue solar panels, silver/dark-metal structure.

## Data

Fire detections: NASA FIRMS (MODIS Collection 6.1 and VIIRS 375 m). Cite with the official FIRMS DOIs.

The 90 glowing fire points on the Spline globe come from `assets/data/fires_sept2019_points.json` (September 2019, Sumatra and Borneo, grid-cell centres). They are placed with the same longitude/latitude mapping as the Blue Marble texture (u = (lon + 180) / 360). The glow sprites are drawn in Spline; they are not NASA imagery.

## Fire data acknowledgement (required by FIRMS)
We acknowledge the use of data and imagery from LANCE FIRMS operated by NASA's Earth Science Data and Information System (ESDIS), with funding provided by NASA Headquarters.
Source page: https://www.earthdata.nasa.gov/data/tools/firms

Citations:
- Giglio, L., Schroeder, W., Justice, C. O. (2016). The collection 6 MODIS active fire detection algorithm and fire products. Remote Sensing of Environment. https://doi.org/10.1016/j.rse.2016.02.054
- Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. A. (2014). The New VIIRS 375 m active fire detection data product. Remote Sensing of Environment. https://doi.org/10.1016/j.rse.2013.12.008
- Davies, D. K., Ilavajhala, S., Wong, M. M., Justice, C. O. (2009). Fire Information for Resource Management System: archiving and distributing MODIS active fire data. IEEE TGRS. https://doi.org/10.1109/TGRS.2008.2002076
- Justice, C. O., et al. (2002). The MODIS fire products. Remote Sensing of Environment. https://doi.org/10.1016/S0034-4257(02)00076-7
