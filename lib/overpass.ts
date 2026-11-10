import { asRecord, fetchJson } from "@/lib/http";
import type { OsmPlace } from "@/lib/match";

type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const memory = new Map<string, { at: number; places: OsmPlace[] }>();

function wheelchair(value: string | undefined): OsmPlace["wheelchair"] {
  if (value === "yes" || value === "limited" || value === "no") return value;
  return null;
}

function driveThrough(value: string | undefined): OsmPlace["driveThrough"] {
  if (value === "yes" || value === "only") return value;
  return null;
}

function toPlace(element: OverpassElement): OsmPlace | null {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (typeof latitude !== "number" || typeof longitude !== "number" || !element.type || element.id === undefined) return null;
  const tags = element.tags ?? {};
  return {
    id: `${element.type}/${element.id}`,
    latitude,
    longitude,
    name: tags.name ?? null,
    street: tags["addr:street"] ?? null,
    housenumber: tags["addr:housenumber"] ?? null,
    postcode: tags["addr:postcode"] ?? null,
    website: tags.website || tags["contact:website"] || null,
    openingHours: tags.opening_hours ?? null,
    wheelchair: wheelchair(tags.wheelchair),
    driveThrough: driveThrough(tags.drive_through),
  };
}

async function interpret(endpoint: string, query: string): Promise<OsmPlace[]> {
  const payload = asRecord(await fetchJson(endpoint, 8000, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  }));
  const elements = Array.isArray(payload?.elements) ? payload.elements as OverpassElement[] : [];
  return elements.map(toPlace).filter((place): place is OsmPlace => Boolean(place));
}

export async function nearbyOsmPharmacies(latitude: number, longitude: number, radiusMiles: number): Promise<OsmPlace[]> {
  const miles = Math.min(Math.max(radiusMiles, 1), 15);
  const key = `${latitude.toFixed(2)}|${longitude.toFixed(2)}|${miles}`;
  const cached = memory.get(key);
  if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) return cached.places;
  const meters = Math.round(miles * 1609.344);
  const query = `[out:json][timeout:12];nwr["amenity"="pharmacy"](around:${meters},${latitude},${longitude});out center tags;`;
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  for (const endpoint of endpoints) {
    try {
      const places = await interpret(endpoint, query);
      memory.set(key, { at: Date.now(), places });
      return places;
    } catch {
      /* Try the next public instance. */
    }
  }
  return [];
}
