import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { runMigrations, updateChannelAdSquadId } from "@/lib/db";
import { getAdSquad } from "@/lib/snapchat/adsquads";
import { getValidAccessToken } from "@/lib/snapchat/client";

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { channelId: string; adSquadId: string; campaignSnapId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.channelId || !body.adSquadId) {
    return NextResponse.json({ error: "channelId and adSquadId required" }, { status: 400 });
  }

  // Verify the ad squad belongs to an ad account the session is allowed to access.
  // This prevents an authenticated user from linking a foreign squad ID to their channel,
  // which would corrupt the Predicto revenue JOIN to show another user's revenue.
  if (isSnapchatConnected(session)) {
    try {
      const token = await getValidAccessToken();
      const squad = await getAdSquad(body.adSquadId, token);
      if (squad.ad_account_id && !isAdAccountAllowed(session, squad.ad_account_id)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    } catch (err) {
      console.error("[link-squad] squad verification failed:", err);
      return NextResponse.json({ error: "invalid_ad_squad_id" }, { status: 422 });
    }
  }

  await runMigrations();
  try {
    await updateChannelAdSquadId(body.channelId, body.adSquadId, session.googleUserId, body.campaignSnapId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
