import { NextRequest, NextResponse } from "next/server";
import { pollMediaStatus } from "@/lib/snapchat/media";
import { getValidAccessToken } from "@/lib/snapchat/client";

export async function POST(request: NextRequest) {
  try {
    await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { mediaId, adAccountId } = await request.json() as {
    mediaId: string;
    adAccountId: string;
  };

  if (!mediaId || !adAccountId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  try {
    await pollMediaStatus(mediaId, adAccountId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
