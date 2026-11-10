import { NextRequest, NextResponse } from "next/server";
import { clientKey, allowRequest, usingFixtures } from "@/lib/http";
import { MSG } from "@/lib/messages";
import { distanceFrom, getPharmacy } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ npi: string }> }) {
  if (usingFixtures()) return NextResponse.json({ error: MSG.fixtures }, { status: 503 });
  if (!(await allowRequest(`detail:${clientKey(request.headers.get("x-forwarded-for"))}`, 30))) {
    return NextResponse.json({ error: MSG.rate }, { status: 429 });
  }
  const { npi } = await context.params;
  if (!/^\d{10}$/.test(npi)) return NextResponse.json({ error: "That NPI could not be found." }, { status: 404 });
  try {
    const pharmacy = await getPharmacy(npi);
    if (!pharmacy) return NextResponse.json({ error: "That NPI could not be found." }, { status: 404 });
    const latitude = Number(request.nextUrl.searchParams.get("lat"));
    const longitude = Number(request.nextUrl.searchParams.get("lon"));
    const distanceMiles = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? distanceFrom(pharmacy, latitude, longitude)
      : null;
    return NextResponse.json({ ...pharmacy, distanceMiles: distanceMiles ?? pharmacy.distanceMiles });
  } catch (error) {
    const message = error instanceof Error ? error.message : MSG.nppes;
    return NextResponse.json({ error: message }, { status: message === MSG.fixtures ? 503 : 502 });
  }
}
