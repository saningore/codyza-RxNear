import { NextRequest, NextResponse } from "next/server";
import { GeocodeError, resolveQuery, suggestionsFor } from "@/lib/geocode";
import { clientKey, allowRequest } from "@/lib/http";
import { MSG } from "@/lib/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await allowRequest(`geocode:${clientKey(request.headers.get("x-forwarded-for"))}`, 30))) {
    return NextResponse.json({ error: MSG.rate }, { status: 429 });
  }
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ error: MSG.enter }, { status: 400 });
  try {
    if (request.nextUrl.searchParams.get("suggest") === "1") {
      const suggestions = await suggestionsFor(query);
      return NextResponse.json({ suggestions });
    }
    const origin = await resolveQuery(query);
    return NextResponse.json(origin);
  } catch (error) {
    const message = error instanceof GeocodeError ? error.message : MSG.address;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
