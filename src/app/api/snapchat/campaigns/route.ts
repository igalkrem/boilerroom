import { NextRequest, NextResponse } from "next/server";
import { createCampaigns } from "@/lib/snapchat/campaigns";
import { getSession, isSessionValid } from "@/lib/session";
import type { SnapCampaignPayload } from "@/types/snapchat";
import { z } from "zod";

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  campaigns: z.array(z.record(z.string(), z.unknown())).min(1),
});

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

  try {
    const results = await createCampaigns(adAccountId, campaigns);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create campaigns error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
