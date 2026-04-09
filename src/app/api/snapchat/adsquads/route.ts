import { NextRequest, NextResponse } from "next/server";
import { createAdSquads } from "@/lib/snapchat/adsquads";
import { getSession, isSessionValid } from "@/lib/session";
import type { SnapAdSquadPayload } from "@/types/snapchat";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { campaignId, adsquads } = (await request.json()) as {
    campaignId: string;
    adsquads: SnapAdSquadPayload[];
  };

  try {
    const results = await createAdSquads(campaignId, adsquads);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create adsquads error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
