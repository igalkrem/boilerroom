import { NextRequest, NextResponse } from "next/server";
import { createAdSquads, getAdSquad } from "@/lib/snapchat/adsquads";
import { getSession, isSessionValid, isAdAccountAllowed } from "@/lib/session";
import type { SnapAdSquadPayload } from "@/types/snapchat";
import { z } from "zod";

export const maxDuration = 60;

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  campaignId: z.string().min(1),
  adsquads: z.array(z.record(z.string(), z.unknown())).min(1)
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

  const adSquadId = request.nextUrl.searchParams.get("adSquadId");
  if (!adSquadId) {
    return NextResponse.json({ error: "adSquadId query param required" }, { status: 400 });
  }

  try {
    const adsquad = await getAdSquad(adSquadId);
    return NextResponse.json({ adsquad });
  } catch (err) {
    console.error("Get ad squad error:", err);
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
    console.error("Adsquads body validation failed:", JSON.stringify(parsed.error.flatten()), "body keys:", body ? Object.keys(body) : null);
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }
  const { adAccountId, campaignId, adsquads } = parsed.data as unknown as {
    adAccountId: string;
    campaignId: string;
    adsquads: SnapAdSquadPayload[];
  };

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const results = await createAdSquads(campaignId, adsquads);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create adsquads error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
