import { websiteHref, zipFive } from "@/lib/format";
import { metersBetween } from "@/lib/geo";
import { OPEN_NOTE, SPLIT_ZONE_NOTE, openNowAt, timeZoneForState } from "@/lib/hours";
import type { Pharmacy } from "@/lib/types";

const NAME_STOP = new Set(["THE", "AND", "OF", "INC", "LLC", "CO", "COMPANY", "PHARMACY", "PHARMACIES", "DRUG", "DRUGS", "STORE", "SHOP", "RX", "PLLC", "PC", "PA"]);
const STREET_STOP = new Set(["ST", "STREET", "AVE", "AVENUE", "BLVD", "BOULEVARD", "RD", "ROAD", "DR", "DRIVE", "LN", "LANE", "WAY", "CT", "COURT", "PL", "PLACE", "N", "S", "E", "W", "NE", "NW", "SE", "SW", "NORTH", "SOUTH", "EAST", "WEST"]);

export type OsmPlace = {
  id: string;
  latitude: number;
  longitude: number;
  name: string | null;
  street: string | null;
  housenumber: string | null;
  postcode: string | null;
  website: string | null;
  openingHours: string | null;
  wheelchair: "yes" | "limited" | "no" | null;
  driveThrough: "yes" | "only" | null;
};

export function nameTokens(value: string | null | undefined): string[] {
  return (value ?? "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !NAME_STOP.has(token));
}

export function streetNumber(value: string | null | undefined): string | null {
  const match = (value ?? "").trim().toUpperCase().match(/^(\d+[A-Z]?)/);
  return match ? match[1] : null;
}

export function overlap(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const other = new Set(right);
  let shared = 0;
  for (const token of new Set(left)) if (other.has(token)) shared += 1;
  const union = new Set([...left, ...right]).size;
  return union ? shared / union : 0;
}

function streetName(value: string | null | undefined): string[] {
  const withoutNumber = (value ?? "").replace(/^\s*\d+[A-Z]?\s*/i, "");
  return withoutNumber
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STREET_STOP.has(token));
}

export function matchScore(pharmacy: Pick<Pharmacy, "name" | "addressLine" | "postalCode" | "latitude" | "longitude">, place: OsmPlace): number | null {
  const meters = pharmacy.latitude !== null && pharmacy.longitude !== null
    ? metersBetween(pharmacy.latitude, pharmacy.longitude, place.latitude, place.longitude)
    : null;
  if (meters !== null && meters > 250) return null;

  const pharmacyZip = zipFive(pharmacy.postalCode);
  const placeZip = zipFive(place.postcode);
  const sameZip = Boolean(pharmacyZip && placeZip && pharmacyZip === placeZip);
  const pharmacyNumber = streetNumber(pharmacy.addressLine);
  const placeNumber = streetNumber(place.housenumber) ?? streetNumber(place.street);
  if (pharmacyNumber && placeNumber && pharmacyNumber !== placeNumber) return null;

  const streetScore = overlap(streetName(pharmacy.addressLine), streetName(place.street));
  const nameScore = overlap(nameTokens(pharmacy.name), nameTokens(place.name));
  const addressMatch = sameZip && Boolean(pharmacyNumber && placeNumber && pharmacyNumber === placeNumber) && streetScore >= 0.6;
  const proximityMatch = meters !== null && meters <= 120 && nameScore >= 0.5;
  if (!addressMatch && !proximityMatch) return null;

  let score = nameScore * 20;
  if (addressMatch) score += 100 + streetScore * 10;
  if (proximityMatch) score += 50 + (120 - (meters ?? 120));
  return score;
}

export function matchPharmacies(pharmacies: Pharmacy[], places: OsmPlace[]): Map<string, OsmPlace> {
  const pairs: { npi: string; id: string; score: number }[] = [];
  for (const pharmacy of pharmacies) {
    for (const place of places) {
      const score = matchScore(pharmacy, place);
      if (score === null) continue;
      pairs.push({ npi: pharmacy.npi, id: place.id, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedPharmacy = new Set<string>();
  const usedOsm = new Set<string>();
  const byId = new Map(places.map((place) => [place.id, place]));
  const matched = new Map<string, OsmPlace>();
  for (const pair of pairs) {
    if (usedPharmacy.has(pair.npi) || usedOsm.has(pair.id)) continue;
    const place = byId.get(pair.id);
    if (!place) continue;
    usedPharmacy.add(pair.npi);
    usedOsm.add(pair.id);
    matched.set(pair.npi, place);
  }
  return matched;
}

const WHEELCHAIR: Record<OsmPlace["wheelchair"] & string, string> = {
  yes: "Wheelchair accessible",
  limited: "Limited wheelchair access",
  no: "Not wheelchair accessible",
};

const DRIVE: Record<NonNullable<OsmPlace["driveThrough"]>, string> = {
  yes: "Drive-through service",
  only: "Drive-through only",
};

export function enrichPharmacy(pharmacy: Pharmacy, place: OsmPlace, now = new Date()): void {
  const website = websiteHref(place.website);
  const hours = place.openingHours?.trim() || null;
  const wheelchair = place.wheelchair ? WHEELCHAIR[place.wheelchair] : null;
  const driveThrough = place.driveThrough ? DRIVE[place.driveThrough] : null;
  if (!website && !hours && !wheelchair && !driveThrough) return;
  pharmacy.website = website;
  pharmacy.hours = hours;
  pharmacy.wheelchair = wheelchair;
  pharmacy.driveThrough = driveThrough;
  pharmacy.osmNote = "Reported in OpenStreetMap. Not confirmed by the pharmacy. Call to verify.";
  if (hours) {
    pharmacy.openNow = openNowAt(hours, pharmacy.state, now);
    if (pharmacy.openNow === null && !timeZoneForState(pharmacy.state)) pharmacy.openNowNote = SPLIT_ZONE_NOTE;
    else if (pharmacy.openNow !== null) pharmacy.openNowNote = OPEN_NOTE;
  }
}
