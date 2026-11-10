import { asRecord, fetchJson } from "@/lib/http";
import { zipFive } from "@/lib/format";
import { milesBetween, roundMiles, zipSearchLimit } from "@/lib/geo";
import { MSG } from "@/lib/messages";
import { pharmacyFromRecord, collapsePharmacies, type NpiRecord } from "@/lib/nppes";
import { nearbyZips, zipCentroid } from "@/lib/reference";
import type { Pharmacy } from "@/lib/types";

const memory = new Map<string, { at: number; records: NpiRecord[] }>();

function resultList(payload: Record<string, unknown> | null): NpiRecord[] {
  return Array.isArray(payload?.results) ? payload.results as NpiRecord[] : [];
}

async function queryZip(zip: string): Promise<NpiRecord[]> {
  const cached = memory.get(zip);
  if (cached && Date.now() - cached.at < 12 * 60 * 60 * 1000) return cached.records;
  const collected: NpiRecord[] = [];
  let skip = 0;
  for (let page = 0; page < 3; page += 1) {
    const search = new URLSearchParams({
      version: "2.1",
      enumeration_type: "NPI-2",
      taxonomy_description: "Pharmacy",
      address_purpose: "LOCATION",
      country_code: "US",
      postal_code: zip,
      limit: "200",
      skip: String(skip),
    });
    const payload = asRecord(await fetchJson(`https://npiregistry.cms.hhs.gov/api/?${search}`, 12000));
    if (payload?.Errors) throw new Error("NPPES rejected the pharmacy query.");
    const results = resultList(payload);
    collected.push(...results);
    const count = Number(payload?.result_count ?? results.length);
    skip += results.length;
    if (!results.length || results.length < 200 || skip >= count) break;
  }
  memory.set(zip, { at: Date.now(), records: collected });
  return collected;
}

export async function fetchNpi(npi: string): Promise<NpiRecord | null> {
  if (!/^\d{10}$/.test(npi)) return null;
  const payload = asRecord(await fetchJson(`https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${npi}`, 12000));
  const record = resultList(payload)[0];
  return record ?? null;
}

export async function loadPharmacies(latitude: number, longitude: number, radiusMiles: number, preferredZip?: string | null, reachMiles = radiusMiles + 8): Promise<{ pharmacies: Pharmacy[]; failedZips: number; checkedZips: number }> {
  const retrievedAt = new Date().toISOString();
  const reach = Math.max(radiusMiles, reachMiles);
  const zips = nearbyZips(latitude, longitude, radiusMiles, zipSearchLimit(radiusMiles));
  if (preferredZip && /^\d{5}$/.test(preferredZip) && !zips.includes(preferredZip) && zipCentroid(preferredZip)) {
    zips.unshift(preferredZip);
  }
  if (!zips.length) return { pharmacies: [], failedZips: 0, checkedZips: 0 };
  const batches: NpiRecord[][] = [];
  let failures = 0;
  let index = 0;
  async function worker(): Promise<void> {
    while (index < zips.length) {
      const current = index;
      index += 1;
      try {
        batches.push(await queryZip(zips[current]));
      } catch {
        failures += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, zips.length) }, () => worker()));
  if (failures === zips.length) throw new Error(MSG.nppes);
  const byNpi = new Map<string, Pharmacy>();
  for (const batch of batches) {
    for (const record of batch) {
      const pharmacy = pharmacyFromRecord(record, retrievedAt);
      if (!pharmacy || pharmacy.inactive) continue;
      const zip = zipFive(pharmacy.postalCode);
      const center = zip ? zipCentroid(zip) : null;
      if (center) {
        pharmacy.distanceMiles = roundMiles(milesBetween(latitude, longitude, center.latitude, center.longitude));
        pharmacy.distanceApproximate = true;
      }
      const sameZip = Boolean(preferredZip && zip === preferredZip);
      if (!sameZip && pharmacy.distanceMiles !== null && pharmacy.distanceMiles > reach) continue;
      byNpi.set(pharmacy.npi, pharmacy);
    }
  }
  return {
    pharmacies: collapsePharmacies([...byNpi.values()]),
    failedZips: failures,
    checkedZips: zips.length,
  };
}
