import { asRecord, fetchJson } from "@/lib/http";
import type { AreaBoundary, SearchOrigin } from "@/lib/types";

const memory = new Map<string, { at: number; value: AreaBoundary | null }>();
const SERVICE = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer";

type Geometry = AreaBoundary["geometry"];

function geometryOf(value: unknown): Geometry | null {
  const record = asRecord(value);
  const type = record?.type;
  if ((type === "Polygon" || type === "MultiPolygon") && Array.isArray(record?.coordinates)) {
    return { type, coordinates: record.coordinates } as Geometry;
  }
  return null;
}

function simplifyRing(ring: number[][], step: number): number[][] {
  if (ring.length <= 80 || step <= 1) return ring;
  const next = ring.filter((_, index) => index % step === 0 || index === ring.length - 1);
  const first = next[0];
  const last = next[next.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) next.push(first);
  return next.length >= 4 ? next : ring;
}

export function simplifyGeometry(geometry: Geometry, maxPoints = 2500): Geometry {
  const count = JSON.stringify(geometry.coordinates).length;
  if (count < 80_000) return geometry;
  const step = Math.ceil(count / 80_000);
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: geometry.coordinates.map((ring) => simplifyRing(ring, step)) };
  }
  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => simplifyRing(ring, step))),
  };
}

async function queryLayer(layer: number, where: string): Promise<Geometry | null> {
  const url = `${SERVICE}/${layer}/query?where=${encodeURIComponent(where)}&outFields=GEOID,NAME,BASENAME,ZCTA5&returnGeometry=true&outSR=4326&f=geojson&geometryPrecision=5&maxAllowableOffset=0.001`;
  const payload = asRecord(await fetchJson(url, 8000));
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const feature = asRecord(features[0]);
  return geometryOf(feature?.geometry);
}

export async function areaBoundary(origin: SearchOrigin): Promise<AreaBoundary | null> {
  if (origin.precision === "zip-center") {
    const zip = origin.label.match(/ZIP code (\d{5})/)?.[1];
    if (!zip) return null;
    return load(`zip:${zip}`, origin.label, "zip", () => queryLayer(2, `ZCTA5='${zip}'`));
  }
  if (origin.precision !== "place" || !origin.state) return null;
  const name = origin.label.split(",")[0]?.replace(/\s+\(census designated place\)$/i, "").trim();
  if (!name) return null;
  const layer = /census designated place/i.test(origin.label) ? 30 : 28;
  const safeName = name.replace(/'/g, "''");
  return load(`place:${origin.state}:${name}:${layer}`, origin.label, "place", async () => {
    const incorporated = await queryLayer(layer, `BASENAME='${safeName}' AND STATE='${origin.state}'`);
    if (incorporated || layer === 30) return incorporated;
    return queryLayer(30, `BASENAME='${safeName}' AND STATE='${origin.state}'`);
  });
}

async function load(key: string, label: string, kind: AreaBoundary["kind"], loadGeometry: () => Promise<Geometry | null>): Promise<AreaBoundary | null> {
  const cached = memory.get(key);
  if (cached && Date.now() - cached.at < 12 * 60 * 60 * 1000) return cached.value;
  try {
    const geometry = await loadGeometry();
    const value = geometry ? { kind, label, geometry: simplifyGeometry(geometry) } : null;
    memory.set(key, { at: Date.now(), value });
    return value;
  } catch {
    memory.set(key, { at: Date.now(), value: null });
    return null;
  }
}
