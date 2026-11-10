import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as geocodeGet } from "@/app/api/geocode/route";
import { GET as healthGet } from "@/app/api/health/route";
import { GET as pharmaciesGet } from "@/app/api/pharmacies/route";
import { GET as pharmacyGet } from "@/app/api/pharmacies/[npi]/route";

describe("RxNear HTTP routes", () => {
  it("reports the gazetteer and live sources", async () => {
    const response = await healthGet();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.fixtures).toBe(false);
    expect(body.sources.zcta.count).toBeGreaterThan(30000);
    expect(body.sources.places.count).toBeGreaterThan(20000);
    expect(body.sources.nppes.mode).toBe("live");
  });

  it("geocodes ZIP 10001 and rejects a bad ZIP", async () => {
    const good = await geocodeGet(new NextRequest("http://localhost/api/geocode?q=10001", {
      headers: { "x-forwarded-for": "198.51.100.21" },
    }));
    expect(good.status).toBe(200);
    const origin = await good.json();
    expect(origin.precision).toBe("zip-center");
    expect(origin.label).toBe("ZIP code 10001");

    const bad = await geocodeGet(new NextRequest("http://localhost/api/geocode?q=1234", {
      headers: { "x-forwarded-for": "198.51.100.22" },
    }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("Enter a 5-digit U.S. ZIP code.");
  });

  it("rejects a pharmacy search with no coordinates and a malformed NPI", async () => {
    const response = await pharmaciesGet(new NextRequest("http://localhost/api/pharmacies?lat=abc&lon=1", {
      headers: { "x-forwarded-for": "198.51.100.23" },
    }));
    expect(response.status).toBe(400);

    const missing = await pharmacyGet(new NextRequest("http://localhost/api/pharmacies/abc"), {
      params: Promise.resolve({ npi: "abc" }),
    });
    expect(missing.status).toBe(404);
  });
});
