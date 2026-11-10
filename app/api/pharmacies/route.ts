import { NextRequest, NextResponse } from "next/server";
import { GeocodeError } from "@/lib/geocode";
import { clientKey, allowRequest, usingFixtures } from "@/lib/http";
import { MSG } from "@/lib/messages";
import { searchPharmacies } from "@/lib/search";
import { normalizeRadius, type SearchOrigin } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRECISIONS = new Set(["zip-center", "place", "address", "device"]);

export async function GET(request: NextRequest) {
  if (usingFixtures()) return NextResponse.json({ error: MSG.fixtures }, { status: 503 });
  if (!(await allowRequest(`search:${clientKey(request.headers.get("x-forwarded-for"))}`, 20))) {
    return NextResponse.json({ error: MSG.rate }, { status: 429 });
  }
  const params = request.nextUrl.searchParams;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  const precision = params.get("precision") ?? "";
  const label = (params.get("label") ?? "").trim().slice(0, 200);
  const accuracy = Number(params.get("accuracy"));
  const state = params.get("state") ?? "";
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !PRECISIONS.has(precision) || !label) {
    return NextResponse.json({ error: MSG.enter }, { status: 400 });
  }
  const origin: SearchOrigin = {
    label,
    latitude,
    longitude,
    precision: precision as SearchOrigin["precision"],
    state: /^[A-Za-z]{2}$/.test(state) ? state.toUpperCase() : null,
    accuracyMeters: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null,
  };
  try {
    const result = await searchPharmacies(origin, normalizeRadius(params.get("radius")));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof GeocodeError || error instanceof Error ? error.message : MSG.nppes;
    const status = message === MSG.nppes ? 502 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
