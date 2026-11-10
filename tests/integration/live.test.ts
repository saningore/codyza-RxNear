import { describe, expect, it } from "vitest";
import { geocodeAddress, resolveQuery } from "@/lib/geocode";
import { getPharmacy, searchPharmacies } from "@/lib/search";

describe("live public pharmacy records", () => {
  it("matches a known street with the Census geocoder", async () => {
    const match = await geocodeAddress("1600 Pennsylvania Ave NW, Washington, DC");
    expect(match?.state).toBe("DC");
    expect(match?.latitude).toBeGreaterThan(38);
    expect(match?.latitude).toBeLessThan(40);
    expect(match?.longitude).toBeLessThan(-76);
    expect(match?.longitude).toBeGreaterThan(-78);
  }, 60_000);

  it("returns real NPPES pharmacies for ZIP 10001", async () => {
    const origin = await resolveQuery("10001");
    const result = await searchPharmacies(origin, 5);
    expect(result.pharmacies.length).toBeGreaterThan(0);
    const npis = result.pharmacies.map((pharmacy) => pharmacy.npi);
    expect(new Set(npis).size).toBe(npis.length);
    for (const pharmacy of result.pharmacies) {
      expect(pharmacy.npi).toMatch(/^\d{10}$/);
      expect(pharmacy.name.length).toBeGreaterThan(1);
      expect(pharmacy.state).toMatch(/^[A-Z]{2}$/);
      expect(pharmacy.sourceRecordUrl).toBe(`https://npiregistry.cms.hhs.gov/provider-view/${pharmacy.npi}`);
      expect(pharmacy.inactive).toBe(false);
      expect(pharmacy.distanceMiles).not.toBeNull();
    }
    const miles = result.pharmacies.map((pharmacy) => pharmacy.distanceMiles ?? 0);
    for (let index = 1; index < miles.length; index += 1) {
      expect(miles[index]).toBeGreaterThanOrEqual(miles[index - 1] - 0.05);
    }
    const first = await getPharmacy(result.pharmacies[0].npi);
    expect(first?.npi).toBe(result.pharmacies[0].npi);
    expect(first?.addressLine).toBeTruthy();
  }, 180_000);
});
