import { NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";

export async function POST() {
  const session = await getSession();

  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Best-effort token revocation at Snapchat's authorization server.
  // The refresh token has a multi-year validity window, so revoking it prevents
  // any leaked token from being used after the user disconnects.
  if (session.snapRefreshToken) {
    try {
      await fetch("https://accounts.snapchat.com/login/oauth2/revoke_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: session.snapRefreshToken,
          client_id: process.env.SNAPCHAT_CLIENT_ID!,
          client_secret: process.env.SNAPCHAT_CLIENT_SECRET!,
        }),
      });
    } catch (err) {
      console.warn("[snapchat/disconnect] token revocation failed:", err);
    }
  }

  session.snapAccessToken = undefined;
  session.snapRefreshToken = undefined;
  session.snapExpiresAt = undefined;
  session.snapUserId = undefined;
  session.allowedAdAccountIds = undefined;
  await session.save();

  return NextResponse.json({ ok: true });
}
