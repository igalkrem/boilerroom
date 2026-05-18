import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, exchangeForLongLivedToken, getMeId } from "@/lib/meta/auth";
import { getSession, isSessionValid } from "@/lib/session";
import { upsertUserMetaToken } from "@/lib/db";

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

  const storedState = session.metaOAuthState;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${appUrl}/dashboard/traffic-sources?error=invalid_state`);
  }

  try {
    const shortToken = await exchangeCodeForTokens(code);
    const longToken = await exchangeForLongLivedToken(shortToken.access_token);

    const metaUserId = await getMeId(longToken.access_token);
    // expires_in is in seconds; convert to unix ms for storage
    const expiresAt = Date.now() + longToken.expires_in * 1000;

    session.metaAccessToken = longToken.access_token;
    session.metaExpiresAt = expiresAt;
    session.metaUserId = metaUserId;
    session.metaOAuthState = undefined;
    await session.save();

    if (session.googleUserId) {
      try {
        await upsertUserMetaToken(session.googleUserId, metaUserId, longToken.access_token, expiresAt);
      } catch (e) {
        console.warn("[auth/meta/callback] failed to persist token:", e);
      }
    }

    return NextResponse.redirect(`${appUrl}/dashboard/traffic-sources`);
  } catch (err) {
    console.error("[auth/meta/callback] error:", err);
    return NextResponse.redirect(`${appUrl}/dashboard/traffic-sources?error=token_exchange_failed`);
  }
}
