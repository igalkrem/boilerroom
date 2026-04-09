import { NextRequest, NextResponse } from "next/server";
import { createAds } from "@/lib/snapchat/ads";
import { getSession, isSessionValid } from "@/lib/session";
import type { SnapAdPayload } from "@/types/snapchat";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { adSquadId, ads } = (await request.json()) as {
    adSquadId: string;
    ads: SnapAdPayload[];
  };

  try {
    const results = await createAds(adSquadId, ads);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create ads error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
