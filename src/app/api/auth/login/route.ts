import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/snapchat/auth";
import { getSession } from "@/lib/session";
import crypto from "crypto";

export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");

  // Store state in session to validate on callback (CSRF protection)
  const session = await getSession();
  session.oauthState = state;
  await session.save();

  const url = buildAuthUrl(state);
  return NextResponse.redirect(url);
}
