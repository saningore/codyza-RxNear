export const UNAVAILABLE = "Information unavailable";

export const PHARMACY_TYPES = [
  { id: "retail", codes: ["3336C0003X"], label: "Community / retail", defaultOn: true },
  { id: "clinic", codes: ["3336C0002X"], label: "Clinic", defaultOn: true },
  { id: "compounding", codes: ["3336C0004X"], label: "Compounding", defaultOn: true },
  { id: "specialty", codes: ["3336S0011X"], label: "Specialty", defaultOn: true },
  { id: "unspecified", codes: ["333600000X"], label: "Pharmacy", defaultOn: true },
  { id: "home-infusion", codes: ["3336H0001X"], label: "Home infusion", defaultOn: false },
  { id: "institutional", codes: ["3336I0012X"], label: "Institutional", defaultOn: false },
  { id: "long-term-care", codes: ["3336L0003X"], label: "Long-term care", defaultOn: false },
  { id: "mail-order", codes: ["3336M0002X"], label: "Mail order", defaultOn: false },
  { id: "managed-care", codes: ["3336M0003X"], label: "Managed care", defaultOn: false },
  { id: "nuclear", codes: ["3336N0007X"], label: "Nuclear", defaultOn: false },
] as const;

export type PharmacyTypeId = (typeof PHARMACY_TYPES)[number]["id"];

export type Pharmacy = {
  npi: string;
  name: string;
  aka: string | null;
  types: PharmacyTypeId[];
  typeLabel: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  openNow: boolean | null;
  openNowNote: string | null;
  wheelchair: string | null;
  driveThrough: string | null;
  osmNote: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinateNote: string | null;
  distanceMiles: number | null;
  distanceApproximate: boolean;
  insideBoundary: boolean | null;
  beyondSelectedRadius: boolean;
  boundaryNote: string | null;
  otherNpis: string[];
  license: string | null;
  taxonomy: string | null;
  updated: string | null;
  parentName: string | null;
  inactive: boolean;
  sourceName: string;
  sourceUrl: string;
  sourceRecordUrl: string;
  retrievedAt: string;
};

export type SearchOrigin = {
  label: string;
  latitude: number;
  longitude: number;
  precision: "zip-center" | "place" | "address" | "device";
  state: string | null;
  accuracyMeters: number | null;
};

export type SourceWarning = { source: string; message: string };

export type AreaBoundary = {
  kind: "zip" | "place";
  label: string;
  geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
};

export type SearchResponse = {
  origin: SearchOrigin;
  pharmacies: Pharmacy[];
  others: Pharmacy[];
  counts: Record<PharmacyTypeId, number>;
  warnings: SourceWarning[];
  capped: boolean;
  unpinned: number;
  boundary: AreaBoundary | null;
};

export const RADII = [1, 5, 10, 25, 50] as const;

export function normalizeRadius(value: unknown): number {
  const radius = Number(value);
  return (RADII as readonly number[]).includes(radius) ? radius : 10;
}

export function emptyCounts(): Record<PharmacyTypeId, number> {
  return Object.fromEntries(PHARMACY_TYPES.map((type) => [type.id, 0])) as Record<PharmacyTypeId, number>;
}
