import { type NextRequest, NextResponse } from "next/server";
import {
  getSession,
  isSessionValid,
  isSnapchatConnected,
  isAdAccountAllowed,
  isMetaConnected,
  isMetaAdAccountAllowed,
} from "@/lib/session";
import { runMigrations, updateChannelAdSquadId } from "@/lib/db";
import { getAdSquad } from "@/lib/snapchat/adsquads";
import { getCampaign } from "@/lib/snapchat/campaigns";
import { getValidAccessToken } from "@/lib/snapchat/client";
import { getAdSet } from "@/lib/meta/adsets";

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: {
    channelId: string;
    adSquadId: string;
    campaignSnapId?: string;
    platform?: "snap" | "meta";
  };
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
  //
  // The verification is REQUIRED, not optional: it is the only thing standing between
  // the write below and an arbitrary squad id, so it must never be skippable.
  //
  // It must also be platform-aware. Both orchestrators call this route, and the Meta
  // one passes a Meta ad set id as `adSquadId` — handing that to Snapchat's
  // /adsquads/{id} always 404s, so a Snap-only check rejects every Meta launch and
  // (because both callers fire this fire-and-forget) loses the link silently.
  const platform = body.platform === "meta" ? "meta" : "snap";

  if (platform === "meta") {
    if (!isMetaConnected(session)) {
      return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
    }
    try {
      const adSet = await getAdSet(body.adSquadId);
      // getAdSet names account_id in its fields= list, so absence here means the
      // ad set could not be attributed — not that the check is inapplicable.
      // metaAllowedAdAccountIds stores the act_ prefix; account_id comes back bare.
      if (!adSet.account_id || !isMetaAdAccountAllowed(session, `act_${adSet.account_id}`)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    } catch (err) {
      console.error("[link-squad] meta ad set verification failed:", err);
      return NextResponse.json({ error: "invalid_ad_squad_id" }, { status: 422 });
    }
  } else {
    if (!isSnapchatConnected(session)) {
      return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
    }
    try {
      const token = await getValidAccessToken();
      const squad = await getAdSquad(body.adSquadId, token);
      // SnapAdSquad.ad_account_id is optional in Snapchat's response, so failing
      // closed on it alone would reject legitimate links. Fall back to the squad's
      // campaign (SnapCampaign.ad_account_id IS required), matching /api/snapchat/ads.
      let owner = squad.ad_account_id;
      if (!owner) {
        const campaign = await getCampaign(squad.campaign_id);
        owner = campaign.ad_account_id;
      }
      if (!owner || !isAdAccountAllowed(session, owner)) {
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
