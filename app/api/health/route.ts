import { NextResponse } from "next/server";
import { rateLimitMode, usingFixtures } from "@/lib/http";
import { MSG } from "@/lib/messages";
import { placeData, zctaData } from "@/lib/reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (usingFixtures()) {
    return NextResponse.json({ ok: false, fixtures: true, error: MSG.fixtures }, { status: 503 });
  }
  try {
    const zcta = zctaData();
    const places = placeData();
    const zctaCount = Object.keys(zcta.centroids).length;
    const placeCount = places.places.length;
    if (zctaCount < 30000 || placeCount < 20000) {
      return NextResponse.json({ ok: false, error: "Reference data is not loaded." }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      fixtures: false,
      rateLimit: {
        mode: rateLimitMode(),
        geocodePerMinute: 30,
        searchPerMinute: 20,
        detailPerMinute: 30,
      },
      sources: {
        zcta: { retrievedAt: zcta.retrievedAt, count: zctaCount, url: zcta.url },
        places: { retrievedAt: places.retrievedAt, count: placeCount, url: places.url },
        nppes: { mode: "live", url: "https://npiregistry.cms.hhs.gov/api-page" },
        census: { mode: "live", url: "https://geocoding.geo.census.gov/geocoder/" },
        openstreetmap: { mode: "enrichment", url: "https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dpharmacy" },
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Reference data is not loaded." }, { status: 503 });
  }
}
