import { NextResponse } from "next/server";
import { buildMetaAuthUrl } from "@/lib/meta/auth";
import { getSession, isSessionValid } from "@/lib/session";
import crypto from "crypto";
import { getAppUrl } from "@/lib/app-url";

export async function GET() {
  const session = await getSession();

  if (!isSessionValid(session)) {
    const appUrl = getAppUrl();
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const state = crypto.randomBytes(16).toString("hex");
  session.metaOAuthState = state;
  await session.save();

  return NextResponse.redirect(buildMetaAuthUrl(state));
}
