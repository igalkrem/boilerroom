import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";
import { runMigrations, updateChannelAdSquadId } from "@/lib/db";

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await runMigrations();
  let body: { channelId: string; adSquadId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.channelId || !body.adSquadId) {
    return NextResponse.json({ error: "channelId and adSquadId required" }, { status: 400 });
  }
  try {
    await updateChannelAdSquadId(body.channelId, body.adSquadId, session.googleUserId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
