import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isAdAccountAllowed, isMetaAdAccountAllowed } from "@/lib/session";
import { runMigrations, assignChannel } from "@/lib/db";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await runMigrations();
  let body: { feedProviderId: string; campaignSnapId?: string; adAccountId: string; trafficSource?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.feedProviderId || !body.adAccountId) {
    return NextResponse.json({ error: "feedProviderId and adAccountId required" }, { status: 400 });
  }
  // Accept either a Snap or a Meta ad account the session owns.
  if (!isAdAccountAllowed(session, body.adAccountId) && !isMetaAdAccountAllowed(session, body.adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Normalize: "Meta"/"Facebook" → "Meta", anything else → "Snap".
  const src = body.trafficSource === "Meta" || body.trafficSource === "Facebook" ? "Meta" : "Snap";
  try {
    const channelId = await assignChannel(body.feedProviderId, body.campaignSnapId ?? "", session.googleUserId, src);
    return NextResponse.json({ channelId });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
