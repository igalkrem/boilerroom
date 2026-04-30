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

  // Skip the Snapchat token endpoint if the current token is still valid.
  // This prevents unnecessary calls and makes the endpoint harder to abuse as a quota-exhaustion vector.
  const REFRESH_BUFFER_MS = 5 * 60 * 1000;
  if (session.snapExpiresAt && Date.now() < session.snapExpiresAt - REFRESH_BUFFER_MS) {
    return NextResponse.json({ ok: true, cached: true });
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
