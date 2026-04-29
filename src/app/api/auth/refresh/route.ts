import { NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/snapchat/auth";
import { getSession, isSessionValid, isSnapchatConnected } from "@/lib/session";

export async function POST() {
  const session = await getSession();

  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 400 });
  }

  try {
    const tokens = await refreshAccessToken(session.snapRefreshToken!);
    session.snapAccessToken = tokens.access_token;
    if (tokens.refresh_token) {
      session.snapRefreshToken = tokens.refresh_token;
    }
    session.snapExpiresAt = Date.now() + tokens.expires_in * 1000;
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Token refresh error:", err);
    return NextResponse.json({ error: "refresh_failed" }, { status: 500 });
  }
}
