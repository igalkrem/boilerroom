import { NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";
import { deleteUserMetaToken } from "@/lib/db";

const META_GRAPH_BASE = "https://graph.facebook.com/v19.0";

export async function POST() {
  const session = await getSession();

  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Best-effort app permission revocation. Prevents a leaked token from
  // retaining access to the user's Meta ad data after disconnecting.
  if (session.metaAccessToken && session.metaUserId) {
    try {
      await fetch(
        `${META_GRAPH_BASE}/${session.metaUserId}/permissions?access_token=${encodeURIComponent(session.metaAccessToken)}`,
        { method: "DELETE" }
      );
    } catch (err) {
      console.warn("[meta/disconnect] permission revocation failed:", err);
    }
  }

  const googleUserId = session.googleUserId;
  session.metaAccessToken = undefined;
  session.metaExpiresAt = undefined;
  session.metaUserId = undefined;
  session.metaAllowedAdAccountIds = undefined;
  session.metaOAuthState = undefined;
  await session.save();

  if (googleUserId) {
    try {
      await deleteUserMetaToken(googleUserId);
    } catch (e) {
      console.warn("[meta/disconnect] failed to delete stored token:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
