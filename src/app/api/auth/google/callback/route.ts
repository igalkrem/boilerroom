import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, fetchGoogleUser } from "@/lib/google/auth";
import { getSession } from "@/lib/session";

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

  const session = await getSession();
  if (!session.googleOAuthState || session.googleOAuthState !== state) {
    return NextResponse.redirect(`${appUrl}/login?error=invalid_state`);
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    const user = await fetchGoogleUser(tokens.access_token);

    session.googleUserId = user.sub;
    session.googleEmail = user.email;
    session.googleName = user.name;
    session.googleAvatar = user.picture;
    session.googleOAuthState = undefined;

    await session.save();

    return NextResponse.redirect(`${appUrl}/dashboard`);
  } catch (err) {
    console.error("[auth/google/callback] error:", err);
    return NextResponse.redirect(`${appUrl}/login?error=token_exchange_failed`);
  }
}
