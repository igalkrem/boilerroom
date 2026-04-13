import { NextRequest, NextResponse } from "next/server";
import { createMediaEntity } from "@/lib/snapchat/media";
import { getSession, isSessionValid } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { adAccountId, name, type } = (await request.json()) as {
    adAccountId: string;
    name: string;
    type: "IMAGE" | "VIDEO";
  };

  try {
    const { mediaId } = await createMediaEntity({ ad_account_id: adAccountId, name, type });
    return NextResponse.json({ mediaId });
  } catch (err) {
    console.error("Create media entity error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
