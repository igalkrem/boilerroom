import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/meta/auth";
import { getSession, isSessionValid } from "@/lib/session";
import crypto from "crypto";

export async function GET() {
  const session = await getSession();

  if (!isSessionValid(session)) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const state = crypto.randomBytes(16).toString("hex");
  session.metaOAuthState = state;
  await session.save();

  let url: string;
  try {
    url = buildAuthUrl(state);
  } catch (err) {
    console.error("[auth/meta/connect] missing env vars:", err);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}/dashboard/traffic-sources?error=meta_not_configured`);
  }

  return NextResponse.redirect(url);
}
