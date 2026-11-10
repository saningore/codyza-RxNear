import { asRecord, fetchJson } from "@/lib/http";
import { stateAbbreviation, zipFive } from "@/lib/format";
import { inSearchableArea } from "@/lib/geo";
import { ambiguousPlace, MSG } from "@/lib/messages";
import { searchPlaces, zipCentroid, type PlaceMatch } from "@/lib/reference";
import type { SearchOrigin } from "@/lib/types";

export type GeocodeSuggestion = SearchOrigin;

export class GeocodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodeError";
  }
}

type CensusMatch = {
  matchedAddress?: string;
  coordinates?: { x?: number; y?: number };
  addressComponents?: { state?: string; city?: string; zip?: string };
};

export async function geocodeAddress(query: string): Promise<GeocodeSuggestion | null> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current&format=json`;
  const payload = asRecord(await fetchJson(url, 8000));
  const result = asRecord(payload?.result);
  const matches = Array.isArray(result?.addressMatches) ? result.addressMatches : [];
  const match = matches[0] as CensusMatch | undefined;
  const latitude = match?.coordinates?.y;
  const longitude = match?.coordinates?.x;
  const state = match?.addressComponents?.state?.toUpperCase() ?? null;
  if (typeof latitude !== "number" || typeof longitude !== "number" || !state) return null;
  if (!inSearchableArea(latitude, longitude)) return null;
  return {
    label: match?.matchedAddress || query,
    latitude,
    longitude,
    precision: "address",
    state,
    accuracyMeters: null,
  };
}

export async function classifyPoint(latitude: number, longitude: number): Promise<"confirmed" | "bounds" | "outside"> {
  if (!inSearchableArea(latitude, longitude)) return "outside";
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${longitude}&y=${latitude}&benchmark=4&vintage=4&format=json`;
    const payload = asRecord(await fetchJson(url, 6000));
    const result = asRecord(payload?.result);
    const geographies = asRecord(result?.geographies);
    const states = geographies
      ? Object.entries(geographies).find(([key, value]) => /state/i.test(key) && Array.isArray(value) && value.length)?.[1]
      : null;
    if (!Array.isArray(states) || !states.length) return "outside";
    const state = asRecord(states[0]);
    const abbrev = String(state?.STUSAB ?? state?.STATE ?? "").toUpperCase();
    return abbrev ? "confirmed" : "outside";
  } catch {
    return "bounds";
  }
}

function placeSuggestion(place: PlaceMatch): GeocodeSuggestion {
  return {
    label: place.label,
    latitude: place.lat,
    longitude: place.lon,
    precision: "place",
    state: place.s,
    accuracyMeters: null,
  };
}

export async function suggestionsFor(query: string): Promise<GeocodeSuggestion[]> {
  const trimmed = query.trim().replace(/\s+/g, " ");
  const zip = zipFive(trimmed);
  if (zip && (trimmed === zip || trimmed.startsWith(`${zip}-`))) {
    const center = zipCentroid(zip);
    if (!center) return [];
    return [{
      label: `ZIP code ${zip}`,
      latitude: center.latitude,
      longitude: center.longitude,
      precision: "zip-center",
      state: null,
      accuracyMeters: null,
    }];
  }
  const comma = trimmed.match(/^(.+?),\s*(.+)$/);
  const state = comma ? stateAbbreviation(comma[2]) : null;
  const placeQuery = state && comma ? `${comma[1]}, ${state}` : trimmed;
  const places = searchPlaces(placeQuery, 6).map(placeSuggestion);
  if (places.length) return places;
  if (/\d/.test(trimmed) || trimmed.includes(",")) {
    const address = await geocodeAddress(trimmed).catch(() => null);
    return address ? [address] : [];
  }
  return [];
}

export async function resolveQuery(query: string): Promise<SearchOrigin> {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > 200) throw new GeocodeError(MSG.enter);
  if (/^\d+$/.test(trimmed) && !zipFive(trimmed)) throw new GeocodeError(MSG.zip);
  const zip = zipFive(trimmed);
  if (zip && (trimmed === zip || trimmed.startsWith(`${zip}-`) || /^(\d{5})(?:-\d{4})?(?:,\s*[A-Za-z .]+)?$/.test(trimmed))) {
    const center = zipCentroid(zip);
    if (!center) throw new GeocodeError(MSG.unknownZip);
    return {
      label: `ZIP code ${zip}`,
      latitude: center.latitude,
      longitude: center.longitude,
      precision: "zip-center",
      state: null,
      accuracyMeters: null,
    };
  }

  const comma = trimmed.match(/^(.+?),\s*(.+)$/);
  const state = comma ? stateAbbreviation(comma[2]) : null;
  if (comma && !state && !/\d/.test(trimmed)) throw new GeocodeError(MSG.cityState);
  const placeQuery = state && comma ? `${comma[1]}, ${state}` : trimmed;
  const places = searchPlaces(placeQuery, 8);
  const name = (comma ? comma[1] : trimmed).trim().toUpperCase();
  const exact = places.filter((place) => place.n.toUpperCase() === name);
  const pool = exact.length ? exact : places.filter((place) => place.n.toUpperCase() === placeQuery.split(",")[0].trim().toUpperCase());
  if (state && pool.length) return placeSuggestion(pool[0]);
  if (!state && pool.length === 1) return placeSuggestion(pool[0]);
  if (!state && pool.length > 1) {
    const [first, second] = pool;
    if (second && first.a >= second.a * 10) return placeSuggestion(first);
    throw new GeocodeError(ambiguousPlace(pool[0].n, pool[0].s));
  }

  if (/\d/.test(trimmed) || trimmed.includes(",")) {
    const address = await geocodeAddress(trimmed);
    if (address) return address;
    throw new GeocodeError(MSG.address);
  }
  throw new GeocodeError(MSG.address);
}
