import { NextRequest, NextResponse } from "next/server";
import { checkMediaStatus } from "@/lib/snapchat/media";
import { getSession, isSessionValid, isAdAccountAllowed } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { mediaId, adAccountId } = (await request.json()) as {
    mediaId: string;
    adAccountId: string;
  };

  if (!mediaId || !adAccountId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const status = await checkMediaStatus(mediaId, adAccountId);
    return NextResponse.json({ status });
  } catch (err) {
    console.error("[media/poll] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
