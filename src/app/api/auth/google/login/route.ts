import { NextResponse } from "next/server";
import { buildGoogleAuthUrl } from "@/lib/google/auth";
import { getSession } from "@/lib/session";
import crypto from "crypto";

export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");

  const session = await getSession();
  session.googleOAuthState = state;
  await session.save();

  const url = buildGoogleAuthUrl(state);
  return NextResponse.redirect(url);
}
