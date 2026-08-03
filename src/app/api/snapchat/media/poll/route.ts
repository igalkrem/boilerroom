import { NextRequest, NextResponse } from "next/server";
import { checkMediaStatus } from "@/lib/snapchat/media";
import { isValidSnapId } from "@/lib/snapchat/client";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }


  // Guarded parse: an unguarded await request.json() throws on a malformed body and
  // surfaces as an unhandled 500 rather than the 400 this clearly is.
  const body = (await request.json().catch(() => null)) as {
    mediaId?: string;
    adAccountId?: string;
  } | null;
  const mediaId = body?.mediaId;
  const adAccountId = body?.adAccountId;

  if (!mediaId || !adAccountId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  if (!isValidSnapId(mediaId)) {
    return NextResponse.json({ error: "invalid_media_id" }, { status: 400 });
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
