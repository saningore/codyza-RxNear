import { zipFive } from "@/lib/format";
import { polygonRelation } from "@/lib/polygon";

export type CoverageInput = {
  latitude: number | null;
  longitude: number | null;
  postalCode: string | null;
  distanceMiles: number | null;
  distanceApproximate: boolean;
};

export function classifyCoverage(
  pharmacy: CoverageInput,
  radiusMiles: number,
  preferredZip: string | null,
  geometry: unknown | null,
): { keep: boolean; beyondSelectedRadius: boolean; insideBoundary: boolean | null; boundaryNote: string | null } {
  const inRadius = pharmacy.distanceMiles !== null && (
    pharmacy.distanceApproximate
      ? pharmacy.distanceMiles <= radiusMiles
      : pharmacy.distanceMiles <= radiusMiles + 0.15
  );
  const sameZip = Boolean(preferredZip && zipFive(pharmacy.postalCode) === preferredZip);
  const inside = geometry && pharmacy.latitude !== null && pharmacy.longitude !== null
    ? polygonRelation(geometry, pharmacy.latitude, pharmacy.longitude) === "inside"
    : null;
  const covered = sameZip || inside === true;
  const beyond = !inRadius && covered;
  let boundaryNote: string | null = null;
  if (beyond && inside) boundaryNote = "Inside the Census boundary for this area, and farther than the selected radius from the center.";
  else if (beyond && sameZip) boundaryNote = "Published in this ZIP code, and farther than the selected radius from the ZIP code center.";
  return { keep: inRadius || beyond, beyondSelectedRadius: beyond, insideBoundary: geometry ? inside : null, boundaryNote };
}
