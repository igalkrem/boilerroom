import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/snapchat/auth";
import { getSession } from "@/lib/session";

const SNAPCHAT_API_BASE = "https://adsapi.snapchat.com/v1";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(`${appUrl}/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/login?error=missing_params`);
  }

  // Validate CSRF state
  const session = await getSession();
  const storedState = session.oauthState;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${appUrl}/login?error=invalid_state`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    session.accessToken = tokens.access_token;
    session.refreshToken = tokens.refresh_token;
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    session.oauthState = undefined; // Clear after use to prevent replay

    // Capture the authenticated user's Snapchat identity using the fresh token.
    // Done with a direct fetch (not snapFetch) to avoid a session re-read dependency.
    // Non-fatal: if this fails the user can still use the app; ownership checks
    // will fall back to Snapchat's own enforcement until the next login.
    try {
      const meRes = await fetch(`${SNAPCHAT_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json() as { me?: { id?: string } };
        if (meData.me?.id) session.snapUserId = meData.me.id;
      }
    } catch {
      console.warn("[auth/callback] Failed to fetch Snapchat user identity — snapUserId will be undefined");
    }

    await session.save();

    return NextResponse.redirect(`${appUrl}/dashboard`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${appUrl}/login?error=token_exchange_failed`);
  }
}
