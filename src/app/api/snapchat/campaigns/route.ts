import { NextRequest, NextResponse } from "next/server";
import { createCampaigns } from "@/lib/snapchat/campaigns";
import { getSession, isSessionValid } from "@/lib/session";
import type { SnapCampaignPayload } from "@/types/snapchat";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { adAccountId, campaigns } = (await request.json()) as {
    adAccountId: string;
    campaigns: SnapCampaignPayload[];
  };

  try {
    const results = await createCampaigns(adAccountId, campaigns);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create campaigns error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
