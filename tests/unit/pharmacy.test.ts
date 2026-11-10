import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collapsePharmacies, pharmacyFromRecord, type NpiRecord } from "@/lib/nppes";
import { distanceLabel, formatPhone, websiteHref } from "@/lib/format";
import { openNowAt, parseOpeningHours, timeZoneForState } from "@/lib/hours";
import { enrichPharmacy, matchPharmacies, matchScore, type OsmPlace } from "@/lib/match";
import { isDefaultType } from "@/lib/taxonomy";
import type { Pharmacy } from "@/lib/types";

const fixture = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/npi-pharmacy.json"), "utf8").replace(/^\uFEFF/, "")) as { results: NpiRecord[] };
const recorded = fixture.results[0];
const retrievedAt = "2026-11-08T00:00:00.000Z";

function place(overrides: Partial<OsmPlace> = {}): OsmPlace {
  return {
    id: "node/1",
    latitude: 40.748,
    longitude: -73.993,
    name: "Moms Pharmacy",
    street: "West 29th Street",
    housenumber: "224",
    postcode: "10001",
    website: "https://example.org/moms",
    openingHours: "Mo-Fr 09:00-17:00",
    wheelchair: "yes",
    driveThrough: null,
    ...overrides,
  };
}

function shell(overrides: Partial<Pharmacy> = {}): Pharmacy {
  const base = pharmacyFromRecord(recorded, retrievedAt);
  if (!base) throw new Error("Recorded NPI fixture did not map.");
  return { ...base, latitude: 40.748, longitude: -73.993, distanceApproximate: false, ...overrides };
}

describe("NPPES pharmacy records", () => {
  it("maps the recorded public pharmacy and ignores the mailing address", () => {
    const pharmacy = pharmacyFromRecord(recorded, retrievedAt);
    expect(pharmacy?.npi).toBe("1508125402");
    expect(pharmacy?.name).toBe("Moms Pharmacy");
    expect(pharmacy?.aka).toBe("AIDS Healthcare Foundation");
    expect(pharmacy?.city).toBe("New York");
    expect(pharmacy?.state).toBe("NY");
    expect(pharmacy?.addressLine).toBe("224 West 29th Street");
    expect(pharmacy?.phone).toBe("(323) 860-5281");
    expect(pharmacy?.types).toEqual(["unspecified"]);
    expect(pharmacy?.website).toBeNull();
    expect(pharmacy?.hours).toBeNull();
    expect(pharmacy?.inactive).toBe(false);
  });

  it("drops a record with no practice location, a non-pharmacy taxonomy, or a short NPI", () => {
    const mailingOnly: NpiRecord = { ...recorded, addresses: recorded.addresses?.filter((address) => address.address_purpose !== "LOCATION") };
    const clinician: NpiRecord = { ...recorded, taxonomies: [{ code: "207Q00000X", desc: "Family Medicine Physician", primary: true }] };
    const short: NpiRecord = { ...recorded, number: "123" };
    expect(pharmacyFromRecord(mailingOnly, retrievedAt)).toBeNull();
    expect(pharmacyFromRecord(clinician, retrievedAt)).toBeNull();
    expect(pharmacyFromRecord(short, retrievedAt)).toBeNull();
  });

  it("keeps a deactivated record marked inactive and rejects a short phone", () => {
    const deactivated: NpiRecord = { ...recorded, basic: { ...recorded.basic, status: "D" } };
    const mapped = pharmacyFromRecord(deactivated, retrievedAt);
    expect(mapped?.inactive).toBe(true);
    const quiet: NpiRecord = {
      ...recorded,
      addresses: recorded.addresses?.map((address) => address.address_purpose === "LOCATION" ? { ...address, telephone_number: "555" } : address),
    };
    expect(pharmacyFromRecord(quiet, retrievedAt)?.phone).toBeNull();
  });

  it("collapses two NPIs at the same door and keeps different names apart", () => {
    const first = shell({ npi: "1508125402" });
    const second = shell({ npi: "1508125403" });
    const collapsed = collapsePharmacies([second, first]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.npi).toBe("1508125402");
    expect(collapsed[0]?.otherNpis).toEqual(["1508125403"]);

    const other = shell({ npi: "1999999999", name: "Other Pharmacy" });
    expect(collapsePharmacies([first, other])).toHaveLength(2);
  });
});

describe("phones, links, and distance labels", () => {
  it("formats a 10-digit phone and rejects anything else", () => {
    expect(formatPhone("323-860-5281")).toBe("(323) 860-5281");
    expect(formatPhone("1 (323) 860-5281")).toBe("(323) 860-5281");
    expect(formatPhone("555")).toBeNull();
    expect(formatPhone("")).toBeNull();
  });

  it("accepts only http and https websites without credentials", () => {
    expect(websiteHref("https://example.org/store")).toBe("https://example.org/store");
    expect(websiteHref("javascript:alert(1)")).toBeNull();
    expect(websiteHref("https://user:pass@example.org")).toBeNull();
    expect(websiteHref("not a url")).toBeNull();
  });

  it("labels ZIP-center and approximate distances", () => {
    expect(distanceLabel(0.4, false, "address")).toBe("0.4 mi");
    expect(distanceLabel(1.2, true, "zip-center")).toBe("About 1.2 mi from the ZIP code center");
    expect(distanceLabel(0.4, false, "zip-center")).toBe("0.4 mi from the ZIP code center");
    expect(distanceLabel(null, false, "device")).toBeNull();
  });
});

describe("opening hours", () => {
  const wednesdayAfternoon = new Date("2026-11-04T15:00:00-05:00");
  const wednesdayEvening = new Date("2026-11-04T20:00:00-05:00");

  it("parses a weekday range and 24/7", () => {
    expect(parseOpeningHours("Mo-Fr 09:00-17:00")).toHaveLength(1);
    expect(parseOpeningHours("24/7")).toHaveLength(1);
    expect(parseOpeningHours("call for hours")).toBeNull();
  });

  it("says open or closed only in a single-timezone state", () => {
    expect(timeZoneForState("NY")).toBe("America/New_York");
    expect(timeZoneForState("TX")).toBeNull();
    expect(openNowAt("Mo-Fr 09:00-17:00", "NY", wednesdayAfternoon)).toBe(true);
    expect(openNowAt("Mo-Fr 09:00-17:00", "NY", wednesdayEvening)).toBe(false);
    expect(openNowAt("24/7", "CA", wednesdayEvening)).toBe(true);
    expect(openNowAt("Mo-Su 22:00-02:00", "NY", new Date("2026-11-04T23:00:00-05:00"))).toBe(true);
    expect(openNowAt("Mo-Su 22:00-02:00", "NY", new Date("2026-11-05T01:00:00-05:00"))).toBe(true);
    expect(openNowAt("Mo-Fr 09:00-17:00", "TX", wednesdayAfternoon)).toBeNull();
    expect(openNowAt("not hours", "NY", wednesdayAfternoon)).toBeNull();
  });
});

describe("OpenStreetMap matching", () => {
  it("matches the same door and rejects another store with the same name", () => {
    const pharmacy = shell();
    expect(matchScore(pharmacy, place())).toBeGreaterThan(0);
    const far = place({
      id: "node/9",
      name: "Moms Pharmacy",
      latitude: 40.78,
      longitude: -73.99,
      website: "https://example.org/other",
    });
    expect(matchScore(pharmacy, far)).toBeNull();
    const differentDoor = place({ id: "node/3", housenumber: "300", latitude: 40.7484, longitude: -73.993 });
    expect(matchScore(pharmacy, differentDoor)).toBeNull();
  });

  it("gives one mapped pharmacy to one NPI and copies only matched fields", () => {
    const first = shell({ npi: "1508125402" });
    const second = shell({ npi: "1999999991", name: "Other Pharmacy", addressLine: "10 Broadway", latitude: 40.71, longitude: -74.01 });
    const matched = matchPharmacies([first, second], [place()]);
    expect(matched.size).toBe(1);
    expect(matched.get("1508125402")?.id).toBe("node/1");
    enrichPharmacy(first, place(), new Date("2026-11-04T15:00:00-05:00"));
    expect(first.website).toBe("https://example.org/moms");
    expect(first.hours).toBe("Mo-Fr 09:00-17:00");
    expect(first.openNow).toBe(true);
    expect(first.wheelchair).toBe("Wheelchair accessible");
    expect(first.osmNote).toMatch(/OpenStreetMap/);
    expect(second.website).toBeNull();
    expect(isDefaultType("unspecified")).toBe(true);
    expect(isDefaultType("mail-order")).toBe(false);
  });
});
