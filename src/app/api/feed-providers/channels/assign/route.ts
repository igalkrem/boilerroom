import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isAdAccountAllowed } from "@/lib/session";
import { runMigrations, assignChannel } from "@/lib/db";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await runMigrations();
  let body: { feedProviderId: string; campaignSnapId: string; adAccountId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.feedProviderId || !body.campaignSnapId || !body.adAccountId) {
    return NextResponse.json({ error: "feedProviderId, campaignSnapId and adAccountId required" }, { status: 400 });
  }
  if (!isAdAccountAllowed(session, body.adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const channelId = await assignChannel(body.feedProviderId, body.campaignSnapId);
    return NextResponse.json({ channelId });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
