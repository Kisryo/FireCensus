export const COUNTRIES: { id: string; name: string }[] = [
  { id: "Indonesia", name: "Indonesia" },
  { id: "Malaysia", name: "Malaysia" },
  { id: "Brunei_Darussalam", name: "Brunei" },
  { id: "Thailand", name: "Thailand" },
  { id: "Myanmar", name: "Myanmar" },
  { id: "Lao_PDR", name: "Laos" },
  { id: "Cambodia", name: "Cambodia" },
];

export const countryName = (id?: string) => COUNTRIES.find((c) => c.id === id)?.name ?? id ?? "";

export type Case = {
  id: string;
  title: string;
  kicker: string;
  country?: string; // if set, the case uses the country instead of the bbox
  bbox: string;
  year: number;
  month: number;
  story: string[];
};

// Numbers below are the API's own outputs for each case's region (/compare, /timeseries), 2026-11-14.
export const CASES: Case[] = [
  {
    id: "indonesia-2026",
    title: "Indonesia 2026: happening now",
    kicker: "Live case · S-NPP retired on 2 Nov 2026",
    country: "Indonesia",
    bbox: "95,-11,141,6",
    year: 2026,
    month: 8,
    story: [
      "Raw NOAA-20 pixel counts make this season look up to 16× normal. Harmonized, August 2026 has 106k fires: 2.0× the 2003–2025 median and the highest August since VIIRS began in 2012, just above 2015. October is 2.3×.",
      "S-NPP stopped delivering data on 2 November 2026. FireCensus treats its missing passes as 'not surveyed', so estimates continue on Aqua + NOAA-20 with no change to the model.",
      "From August, months use near-real-time data. Static heat sources are masked using science-quality fire-type flags.",
    ],
  },
  {
    id: "borneo-2019",
    title: "Borneo & Sumatra 2019",
    kicker: "Main case · three sensors overlap",
    bbox: "95,-6,120,6",
    year: 2019,
    month: 9,
    story: [
      "Peat fires smoulder: small, low-power and smoky, the hardest fires for a 1 km MODIS pixel to see.",
      "All three afternoon sensors were flying, so the capture-recapture design is at its strongest.",
      "September 2019 had 73k fires, 1.4× the median September. That is severe, but still below 2006, 2009 and 2015 in the same area.",
    ],
  },
  {
    id: "indonesia-2015",
    title: "The 2015 haze",
    kicker: "Historical benchmark",
    country: "Indonesia",
    bbox: "95,-11,141,6",
    year: 2015,
    month: 9,
    story: [
      "The worst haze crisis of the VIIRS era, during a strong El Niño.",
      "September 2015 is Indonesia's highest September on record: 166k fires, 2.3× the median. Its September and October still exceed 2026.",
      "Only Aqua and S-NPP were flying (NOAA-20 came later), so this year shows the model working with two sensors.",
    ],
  },
  {
    id: "indonesia-2006",
    title: "Indonesia 2006: the MODIS-only era",
    kicker: "Back-cast · 2002–2011",
    country: "Indonesia",
    bbox: "95,-11,141,6",
    year: 2006,
    month: 10,
    story: [
      "Before 2012 only MODIS was in orbit, and it misses most small fires.",
      "FireCensus learns from 2012–2021 how many fires MODIS misses, then restores them. October 2006 comes out at 191k fires, 4.5× the median and the highest October on record. Aqua's own raw counts rank it first too.",
      "Regional monthly totals are validated (12.5% leave-one-year-out error). Single 0.1° cells are noisy in this era.",
    ],
  },
  {
    id: "mainland-2020",
    title: "Mainland burning season, March 2020",
    kicker: "Agricultural fires",
    bbox: "92,10,110,24",
    year: 2020,
    month: 3,
    story: [
      "Thousands of small crop-residue fires across Thailand, Myanmar, Laos and Cambodia.",
      "March 2020 had 334k fires, while raw MODIS saw only 26k: about 1 in 13. Small fires like these are where the correction matters most.",
      "March is the peak every year. 2020 was a typical season (1.0× the median).",
    ],
  },
];

// ---- Spline globe pins (scene v4). Pin ids must match Spline object names Pin_<id> / PinHit_<id>
//      and scene states Explore_<id>.
export type PinRegion = { id: string; name: string; region: { country?: string; bbox?: string }; areaKey: string };

export const REGIONS: PinRegion[] = [
  { id: "indonesia", name: "Indonesia", region: { country: "Indonesia" }, areaKey: "country:Indonesia" },
  { id: "borneo_sumatra", name: "Borneo & Sumatra", region: { bbox: "95,-6,120,6" }, areaKey: "region:borneo_sumatra" },
  { id: "mainland", name: "Mainland SE Asia", region: { bbox: "92,10,110,24" }, areaKey: "region:mainland" },
  { id: "malaysia", name: "Malaysia", region: { country: "Malaysia" }, areaKey: "country:Malaysia" },
  { id: "brunei", name: "Brunei", region: { country: "Brunei_Darussalam" }, areaKey: "country:Brunei_Darussalam" },
  { id: "thailand", name: "Thailand", region: { country: "Thailand" }, areaKey: "country:Thailand" },
  { id: "myanmar", name: "Myanmar", region: { country: "Myanmar" }, areaKey: "country:Myanmar" },
  { id: "laos", name: "Laos", region: { country: "Lao_PDR" }, areaKey: "country:Lao_PDR" },
  { id: "cambodia", name: "Cambodia", region: { country: "Cambodia" }, areaKey: "country:Cambodia" },
];

/** Which globe pin shows a given panel area (case:/country:/region: key). */
export function pinForArea(key: string): string {
  const [kind, id] = key.split(":");
  if (kind === "region") return id;
  if (kind === "country") return REGIONS.find((r) => r.region.country === id)?.id ?? "indonesia";
  const c = CASES.find((x) => x.id === id);
  if (!c) return "indonesia";
  if (c.country) return REGIONS.find((r) => r.region.country === c.country)?.id ?? "indonesia";
  return c.id === "mainland-2020" ? "mainland" : "borneo_sumatra";
}

/** API region and display name for a panel area key (case:/country:/region:). */
export function regionForArea(key: string): { country?: string; bbox?: string } {
  const [kind, id] = key.split(":");
  if (kind === "country") return { country: id };
  if (kind === "region") return REGIONS.find((r) => r.id === id)?.region ?? { country: "Indonesia" };
  const c = CASES.find((x) => x.id === id);
  return c ? (c.country ? { country: c.country } : { bbox: c.bbox }) : { country: "Indonesia" };
}
export function labelForArea(key: string): string {
  const [kind, id] = key.split(":");
  if (kind === "country") return REGIONS.find((r) => r.region.country === id)?.name ?? countryName(id);
  if (kind === "region") return REGIONS.find((r) => r.id === id)?.name ?? id;
  return CASES.find((x) => x.id === id)?.title ?? id;
}
