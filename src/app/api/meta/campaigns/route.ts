import { NextRequest, NextResponse } from "next/server";
import { createCampaign, getCampaigns } from "@/lib/meta/campaigns";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import type { MetaCampaignPayload } from "@/types/meta";
import { z } from "zod";

export const maxDuration = 60;

const postSchema = z.object({
  adAccountId: z.string().min(1),
  campaign: z.object({
    name: z.string().min(1),
    status: z.enum(["ACTIVE", "PAUSED"]),
    objective: z.literal("OUTCOME_SALES"),
    special_ad_categories: z.array(z.string()),
    is_adset_budget_sharing_enabled: z.boolean().optional(),
    daily_budget: z.number().optional(),
    lifetime_budget: z.number().optional(),
  }),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const adAccountId = request.nextUrl.searchParams.get("adAccountId");
  if (!adAccountId) {
    return NextResponse.json({ error: "adAccountId required" }, { status: 400 });
  }
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const campaigns = await getCampaigns(adAccountId);
    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error("[meta/campaigns] GET error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { adAccountId, campaign } = parsed.data;
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    console.error(
      `[meta/campaigns] POST forbidden: adAccountId=${adAccountId} not in metaAllowedAdAccountIds=${JSON.stringify(session.metaAllowedAdAccountIds)}`
    );
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await createCampaign(adAccountId, campaign as MetaCampaignPayload);
    return NextResponse.json({ campaign: result });
  } catch (err) {
    console.error("[meta/campaigns] POST error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
