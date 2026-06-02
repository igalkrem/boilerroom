import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, exchangeForLongLivedToken, getMetaUserId } from "@/lib/meta/auth";
import { getSession, isSessionValid } from "@/lib/session";
import { upsertUserMetaToken } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectBase = `${appUrl}/dashboard/traffic-sources`;

  if (error) {
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${redirectBase}?error=missing_params`);
  }

  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const storedState = session.metaOAuthState;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${redirectBase}?error=invalid_state`);
  }

  try {
    const shortLivedToken = await exchangeCodeForToken(code);
    const { accessToken, expiresAt } = await exchangeForLongLivedToken(shortLivedToken);
    const metaUserId = await getMetaUserId(accessToken);

    session.metaAccessToken = accessToken;
    session.metaExpiresAt = expiresAt;
    session.metaUserId = metaUserId;
    session.metaOAuthState = undefined;
    await session.save();

    if (session.googleUserId) {
      try {
        await upsertUserMetaToken(session.googleUserId, metaUserId, accessToken, expiresAt);
      } catch (e) {
        console.warn("[auth/meta/callback] failed to persist token:", e);
      }
    }

    return NextResponse.redirect(redirectBase);
  } catch (err) {
    console.error("[auth/meta/callback] error:", err);
    return NextResponse.redirect(`${redirectBase}?error=token_exchange_failed`);
  }
}
