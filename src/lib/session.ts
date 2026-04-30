import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionData } from "@/types/session";

export async function getSession(): Promise<IronSession<SessionData>> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET env var must be set to at least 32 characters");
  }
  const session = await getIronSession<SessionData>(await cookies(), {
    cookieName: process.env.SESSION_COOKIE_NAME || "snap_ads_session",
    password: secret,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      // "lax" allows cross-site OAuth redirects (Google and Snapchat both redirect back cross-site)
      sameSite: "lax" as const,
      maxAge: 14 * 24 * 60 * 60, // 14 days; iron-session resets the clock on every save()
    },
  });
  return session;
}

export function isSessionValid(session: Partial<SessionData>): session is SessionData {
  return !!session.googleUserId;
}

export function isSnapchatConnected(session: SessionData): boolean {
  return !!(session.snapAccessToken && session.snapUserId);
}

/**
 * Returns true if the adAccountId is among the user's known accounts.
 * Denies by default if the allowed list has not been populated yet — the
 * caller must ensure the session has been bootstrapped via /api/snapchat/ad-accounts.
 */
export function isAdAccountAllowed(session: SessionData, adAccountId: string): boolean {
  if (!session.allowedAdAccountIds?.length) return false;
  return session.allowedAdAccountIds.includes(adAccountId);
}
