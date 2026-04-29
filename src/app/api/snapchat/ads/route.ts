import { NextRequest, NextResponse } from "next/server";
import { createAds, getAd } from "@/lib/snapchat/ads";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import type { SnapAdPayload } from "@/types/snapchat";
import { z } from "zod";

export const maxDuration = 60;

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  adSquadId: z.string().min(1),
  ads: z.array(z.record(z.string(), z.unknown())).min(1)
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
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }

  const adAccountId = request.nextUrl.searchParams.get("adAccountId");
  const adId = request.nextUrl.searchParams.get("adId");
  if (!adAccountId || !adId) {
    return NextResponse.json({ error: "adAccountId and adId query params required" }, { status: 400 });
  }
  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const ad = await getAd(adId);
    return NextResponse.json({ ad });
  } catch (err) {
    console.error("Get ad error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }


  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    console.error("Ads body validation failed:", JSON.stringify(parsed.error.flatten()), "body keys:", body ? Object.keys(body) : null);
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }
  const { adAccountId, adSquadId, ads } = parsed.data as unknown as {
    adAccountId: string;
    adSquadId: string;
    ads: SnapAdPayload[];
  };

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    console.log("[createAds] payload:", JSON.stringify({ ads }));
    const results = await createAds(adSquadId, ads);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create ads error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
