import { NextResponse } from "next/server";
import { getSession, isSessionValid, isSnapchatConnected, isMetaConnected } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    googleUserId: session.googleUserId,
    googleEmail: session.googleEmail,
    googleName: session.googleName,
    googleAvatar: session.googleAvatar,
    snapConnected: isSnapchatConnected(session),
    snapUserId: session.snapUserId,
    metaConnected: isMetaConnected(session),
    metaExpiresAt: session.metaExpiresAt,
  });
}
