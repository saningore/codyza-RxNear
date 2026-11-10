import { areaBoundary } from "@/lib/boundary";
import { classifyCoverage } from "@/lib/coverage";
import { zipFive } from "@/lib/format";
import { classifyPoint, geocodeAddress, GeocodeError } from "@/lib/geocode";
import { inSearchableArea, milesBetween, roundMiles } from "@/lib/geo";
import { usingFixtures } from "@/lib/http";
import { enrichPharmacy, matchPharmacies } from "@/lib/match";
import { MSG } from "@/lib/messages";
import { pharmacyFromRecord } from "@/lib/nppes";
import { fetchNpi, loadPharmacies } from "@/lib/registry";
import { nearbyOsmPharmacies } from "@/lib/overpass";
import { isDefaultType } from "@/lib/taxonomy";
import { emptyCounts, type Pharmacy, type SearchOrigin, type SearchResponse } from "@/lib/types";

function assertLive(): void {
  if (usingFixtures()) throw new GeocodeError(MSG.fixtures);
}

async function runPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function run(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => run()));
}

async function geocodeSome(pharmacies: Pharmacy[], origin: SearchOrigin, limit: number): Promise<number> {
  const pending = pharmacies
    .filter((pharmacy) => pharmacy.addressLine && pharmacy.city && pharmacy.state)
    .sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999))
    .slice(0, limit);
  let missed = 0;
  await runPool(pending, 6, async (pharmacy) => {
    const query = [pharmacy.addressLine, pharmacy.city, pharmacy.state, zipFive(pharmacy.postalCode)].filter(Boolean).join(", ");
    try {
      const match = await geocodeAddress(query);
      if (!match) {
        missed += 1;
        return;
      }
      const miles = milesBetween(origin.latitude, origin.longitude, match.latitude, match.longitude);
      pharmacy.latitude = match.latitude;
      pharmacy.longitude = match.longitude;
      pharmacy.distanceMiles = roundMiles(miles);
      pharmacy.distanceApproximate = false;
      pharmacy.coordinateNote = "Coordinates from the U.S. Census Bureau geocoder for the NPPES practice-location address";
    } catch {
      missed += 1;
    }
  });
  return missed;
}

function byDistance(a: Pharmacy, b: Pharmacy): number {
  return (a.distanceMiles ?? 9999) - (b.distanceMiles ?? 9999) || a.name.localeCompare(b.name);
}

export async function searchPharmacies(origin: SearchOrigin, radiusMiles: number, now = new Date()): Promise<SearchResponse> {
  assertLive();
  if (!inSearchableArea(origin.latitude, origin.longitude)) throw new GeocodeError(MSG.outside);
  let label = origin.label;
  if (origin.precision === "device") {
    const kind = await classifyPoint(origin.latitude, origin.longitude);
    if (kind === "outside") throw new GeocodeError(MSG.outside);
    if (kind === "bounds") label = `${origin.label} (U.S. check incomplete)`;
  }
  const resolved: SearchOrigin = { ...origin, label };
  const preferred = origin.precision === "zip-center" ? origin.label.match(/ZIP code (\d{5})/)?.[1] ?? null : null;
  const wide = origin.precision === "zip-center" || origin.precision === "place";
  const osmPromise = nearbyOsmPharmacies(origin.latitude, origin.longitude, radiusMiles).catch(() => []);
  const boundaryPromise = wide ? areaBoundary(resolved).catch(() => null) : Promise.resolve(null);
  const loaded = await loadPharmacies(origin.latitude, origin.longitude, radiusMiles, preferred, wide ? Math.max(radiusMiles + 8, 25) : radiusMiles + 8);
  const defaults = loaded.pharmacies.filter((pharmacy) => pharmacy.types.some(isDefaultType)).sort(byDistance);
  const others = loaded.pharmacies.filter((pharmacy) => !pharmacy.types.some(isDefaultType)).sort(byDistance);
  const capped = defaults.length > 40 || others.length > 15;
  const listedDefaults = defaults.slice(0, 40);
  const listedOthers = others.slice(0, 15);
  await geocodeSome(listedDefaults, resolved, 40);
  await geocodeSome(listedOthers, resolved, 8);
  const boundary = await boundaryPromise;
  const geometry = boundary?.geometry ?? null;
  for (const pharmacy of [...listedDefaults, ...listedOthers]) {
    const coverage = classifyCoverage(pharmacy, radiusMiles, preferred, geometry);
    pharmacy.insideBoundary = coverage.insideBoundary;
    pharmacy.beyondSelectedRadius = coverage.beyondSelectedRadius;
    pharmacy.boundaryNote = coverage.boundaryNote;
  }
  const pharmacies = listedDefaults.filter((pharmacy) => classifyCoverage(pharmacy, radiusMiles, preferred, geometry).keep).sort(byDistance);
  const otherPharmacies = listedOthers.filter((pharmacy) => classifyCoverage(pharmacy, radiusMiles, preferred, geometry).keep).sort(byDistance);
  const visible = [...pharmacies, ...otherPharmacies];
  try {
    const places = await osmPromise;
    const matched = matchPharmacies(visible, places);
    for (const pharmacy of visible) {
      const place = matched.get(pharmacy.npi);
      if (place) enrichPharmacy(pharmacy, place, now);
    }
  } catch {
    /* Hours and websites stay unavailable when OpenStreetMap cannot be read. */
  }
  const counts = emptyCounts();
  for (const pharmacy of [...pharmacies, ...otherPharmacies]) {
    for (const type of pharmacy.types) counts[type] += 1;
  }
  const warnings = [];
  if (loaded.failedZips > 0) warnings.push({ source: "NPPES", message: MSG.zipPartial });
  const unpinned = visible.filter((pharmacy) => pharmacy.latitude === null).length;
  if (unpinned > 0) warnings.push({ source: "Census", message: MSG.geocodePartial });
  if (wide && !boundary) warnings.push({ source: "Census boundary", message: MSG.boundaryMissing });
  return { origin: resolved, pharmacies, others: otherPharmacies, counts, warnings, capped, unpinned, boundary };
}

export async function getPharmacy(npi: string, now = new Date()): Promise<Pharmacy | null> {
  assertLive();
  const record = await fetchNpi(npi);
  if (!record) return null;
  const pharmacy = pharmacyFromRecord(record, new Date().toISOString());
  if (!pharmacy) return null;
  const query = [pharmacy.addressLine, pharmacy.city, pharmacy.state, zipFive(pharmacy.postalCode)].filter(Boolean).join(", ");
  if (query) {
    try {
      const match = await geocodeAddress(query);
      if (match) {
        pharmacy.latitude = match.latitude;
        pharmacy.longitude = match.longitude;
        pharmacy.coordinateNote = "Coordinates from the U.S. Census Bureau geocoder for the NPPES practice-location address";
      }
    } catch {
      /* The published address is still shown. */
    }
  }
  if (pharmacy.latitude !== null && pharmacy.longitude !== null && !pharmacy.inactive) {
    try {
      const places = await nearbyOsmPharmacies(pharmacy.latitude, pharmacy.longitude, 1);
      const matched = matchPharmacies([pharmacy], places);
      const place = matched.get(pharmacy.npi);
      if (place) enrichPharmacy(pharmacy, place, now);
    } catch {
      /* Optional enrichment. */
    }
  }
  return pharmacy;
}

export function distanceFrom(pharmacy: Pharmacy, latitude: number, longitude: number): number | null {
  const pointLat = pharmacy.latitude;
  const pointLon = pharmacy.longitude;
  if (pointLat === null || pointLon === null) return null;
  if (!inSearchableArea(latitude, longitude)) return null;
  return roundMiles(milesBetween(latitude, longitude, pointLat, pointLon));
}
