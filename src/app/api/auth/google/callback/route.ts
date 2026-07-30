import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, fetchGoogleUser } from "@/lib/google/auth";
import { getSession } from "@/lib/session";
import { getAppUrl } from "@/lib/app-url";

// Only accounts on this email domain may sign in. Without this gate ANY Google
// account became a fully provisioned tenant, which turned every per-tenant
// authorization gap into one reachable by anyone on the internet.
const ALLOWED_EMAIL_DOMAIN = "adcore.com";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = getAppUrl();

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

    // Reject before any session field is written. `email_verified === false` is
    // checked explicitly rather than requiring truthiness, so a missing field
    // cannot lock every user out.
    const email = user.email?.toLowerCase() ?? "";
    if (user.email_verified === false || !email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      console.warn(`[auth/google/callback] rejected sign-in for ${email || "<no email>"}`);
      session.googleOAuthState = undefined;
      await session.save();
      return NextResponse.redirect(`${appUrl}/login?error=not_authorized`);
    }

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
