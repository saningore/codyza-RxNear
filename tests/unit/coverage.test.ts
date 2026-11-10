import { describe, expect, it } from "vitest";
import { classifyCoverage } from "@/lib/coverage";
import { centroidsFromRows, parsePipe } from "@/lib/gazetteer";
import { rateLimit, rateLimitMode } from "@/lib/http";
import { polygonRelation, registryChanged } from "@/lib/polygon";

const square = {
  type: "Polygon" as const,
  coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
};

const holed = {
  type: "Polygon" as const,
  coordinates: [
    [[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]],
    [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]],
  ],
};

describe("Census boundaries and coverage", () => {
  it("classifies points inside, outside, and on a polygon", () => {
    expect(polygonRelation(square, 0, 0)).toBe("inside");
    expect(polygonRelation(square, 3, 3)).toBe("outside");
    expect(polygonRelation(square, 1, 0)).toBe("inside");
    expect(polygonRelation(holed, 0, 0)).toBe("outside");
    expect(polygonRelation(holed, 1.5, 0)).toBe("inside");
    expect(polygonRelation({ type: "LineString", coordinates: [] }, 0, 0)).toBe("none");
  });

  it("keeps a pharmacy inside the radius, the searched ZIP, or the Census boundary", () => {
    const near = classifyCoverage({ latitude: 0, longitude: 0, postalCode: "99999", distanceMiles: 4, distanceApproximate: false }, 5, "10001", square);
    expect(near.keep).toBe(true);
    expect(near.beyondSelectedRadius).toBe(false);

    const sameZip = classifyCoverage({ latitude: null, longitude: null, postalCode: "10001-1234", distanceMiles: 12, distanceApproximate: true }, 5, "10001", null);
    expect(sameZip.keep).toBe(true);
    expect(sameZip.beyondSelectedRadius).toBe(true);
    expect(sameZip.boundaryNote).toMatch(/Published in this ZIP code/);

    const inside = classifyCoverage({ latitude: 0, longitude: 0, postalCode: "10002", distanceMiles: 9, distanceApproximate: false }, 5, "10001", square);
    expect(inside.keep).toBe(true);
    expect(inside.insideBoundary).toBe(true);
    expect(inside.boundaryNote).toMatch(/Inside the Census boundary/);

    const outside = classifyCoverage({ latitude: 3, longitude: 3, postalCode: "10002", distanceMiles: 9, distanceApproximate: false }, 5, "10001", square);
    expect(outside.keep).toBe(false);
  });

  it("parses a Census pipe gazetteer into ZIP centroids", () => {
    const rows = parsePipe("GEOID|INTPTLAT|INTPTLONG\n10001|40.75064|-73.9973\nbad|no|no\n");
    expect(centroidsFromRows(rows)).toEqual({ "10001": [40.75064, -73.9973] });
  });

  it("limits requests per key and reports the shared-store mode", () => {
    const key = `unit-${Date.now()}`;
    expect(rateLimit(key, 2)).toBe(true);
    expect(rateLimit(key, 2)).toBe(true);
    expect(rateLimit(key, 2)).toBe(false);
    expect(rateLimitMode()).toBe(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? "upstash" : "memory");
  });

  it("treats NPI list order as the same set", () => {
    expect(registryChanged(["2", "1", "1"], ["1", "2"])).toBe(false);
    expect(registryChanged(["1"], ["1", "2"])).toBe(true);
  });
});
