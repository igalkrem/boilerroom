import { type NextRequest, NextResponse } from "next/server";
import { getFirstProfileId } from "@/lib/snapchat/profiles";
import { getSession, isSessionValid, isAdAccountAllowed } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const adAccountId = request.nextUrl.searchParams.get("adAccountId");
  if (!adAccountId) {
    return NextResponse.json({ error: "missing_adAccountId" }, { status: 400 });
  }

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const profileId = await getFirstProfileId(adAccountId);
    console.log(`[profiles route] adAccountId=${adAccountId} → profileId=${profileId}`);
    return NextResponse.json({ profileId });
  } catch (err) {
    console.error("[profiles route] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
