import { describe, expect, it } from "vitest";
import { GeocodeError, resolveQuery } from "@/lib/geocode";
import { MSG } from "@/lib/messages";
import { nearbyZips, zipCentroid } from "@/lib/reference";

describe("Census gazetteer locations", () => {
  it("resolves a known ZIP to its published center", async () => {
    const origin = await resolveQuery("10001");
    const center = zipCentroid("10001");
    expect(origin.precision).toBe("zip-center");
    expect(origin.label).toBe("ZIP code 10001");
    expect(origin.latitude).toBe(center?.latitude);
    expect(origin.longitude).toBe(center?.longitude);
  });

  it("rejects a short ZIP and an unknown ZIP", async () => {
    await expect(resolveQuery("1234")).rejects.toThrow(new GeocodeError(MSG.zip));
    await expect(resolveQuery("00000")).rejects.toThrow(new GeocodeError(MSG.unknownZip));
  });

  it("resolves a city and state, and asks for a state when several places match", async () => {
    const chicago = await resolveQuery("Chicago, IL");
    expect(chicago.precision).toBe("place");
    expect(chicago.state).toBe("IL");
    expect(chicago.label).toMatch(/Chicago, IL/);
    await expect(resolveQuery("Springfield")).rejects.toThrow(/Several places match/);
  });

  it("finds the searched ZIP among nearby ZIP codes", () => {
    const center = zipCentroid("10001");
    expect(center).not.toBeNull();
    const zips = nearbyZips(center!.latitude, center!.longitude, 5, 12);
    expect(zips[0]).toBe("10001");
    expect(zips.length).toBeGreaterThan(1);
  });
});
