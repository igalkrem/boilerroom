import { NextRequest, NextResponse } from "next/server";
import { createCreatives } from "@/lib/snapchat/creatives";
import { getSession, isSessionValid } from "@/lib/session";
import type { SnapCreativePayload } from "@/types/snapchat";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { adAccountId, creatives } = (await request.json()) as {
    adAccountId: string;
    creatives: SnapCreativePayload[];
  };

  try {
    const results = await createCreatives(adAccountId, creatives);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Create creatives error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
