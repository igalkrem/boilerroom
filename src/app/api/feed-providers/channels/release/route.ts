import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";
import { runMigrations, releaseChannel } from "@/lib/db";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await runMigrations();
  let body: { campaignSnapId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.campaignSnapId) {
    return NextResponse.json({ error: "campaignSnapId required" }, { status: 400 });
  }
  try {
    await releaseChannel(body.campaignSnapId, session.googleUserId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
