import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/snapchat/auth";
import { getSession, isSessionValid } from "@/lib/session";
import { upsertUserToken } from "@/lib/db";

const SNAPCHAT_API_BASE = "https://adsapi.snapchat.com/v1";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(`${appUrl}/dashboard/traffic-sources?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard/traffic-sources?error=missing_params`);
  }

  const session = await getSession();

  if (!isSessionValid(session)) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const storedState = session.snapchatOAuthState;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${appUrl}/dashboard/traffic-sources?error=invalid_state`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    session.snapAccessToken = tokens.access_token;
    session.snapRefreshToken = tokens.refresh_token;
    session.snapExpiresAt = Date.now() + tokens.expires_in * 1000;
    session.snapchatOAuthState = undefined;

    // Fetch Snapchat user ID — non-fatal if this fails
    try {
      const meRes = await fetch(`${SNAPCHAT_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json() as { me?: { id?: string } };
        if (meData.me?.id) session.snapUserId = meData.me.id;
      }
    } catch {
      console.warn("[auth/snapchat/callback] Failed to fetch Snapchat user identity");
    }

    await session.save();

    // Persist refresh token in DB so the server-side cron can sync without a browser session.
    if (session.googleUserId && tokens.refresh_token) {
      try {
        await upsertUserToken(session.googleUserId, tokens.refresh_token);
      } catch (e) {
        console.warn("[auth/snapchat/callback] failed to persist token:", e);
      }
    }

    return NextResponse.redirect(`${appUrl}/dashboard/traffic-sources`);
  } catch (err) {
    console.error("[auth/snapchat/callback] error:", err);
    return NextResponse.redirect(`${appUrl}/dashboard/traffic-sources?error=token_exchange_failed`);
  }
}
