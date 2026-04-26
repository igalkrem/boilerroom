import { NextRequest, NextResponse } from "next/server";
import { createCampaigns, getCampaign } from "@/lib/snapchat/campaigns";
import { getSession, isSessionValid, isAdAccountAllowed } from "@/lib/session";
import type { SnapCampaignPayload } from "@/types/snapchat";
import { z } from "zod";

export const maxDuration = 60;

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  campaigns: z.array(z.record(z.string(), z.unknown())).min(1)
    .refine(
      (items) => { const n = items.map((i) => i.name as string).filter(Boolean); return new Set(n).size === n.length; },
      { message: "Duplicate names in batch" }
    ),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId query param required" }, { status: 400 });
  }

  try {
    const campaign = await getCampaign(campaignId);
    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("Get campaign error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    console.error("Campaigns body validation failed:", JSON.stringify(parsed.error.flatten()), "body keys:", body ? Object.keys(body) : null);
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }
  const { adAccountId, campaigns } = parsed.data as unknown as {
    adAccountId: string;
    campaigns: SnapCampaignPayload[];
  };

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const results = await createCampaigns(adAccountId, campaigns);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create campaigns error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
