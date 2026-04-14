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
      // "lax" is required: Snapchat OAuth redirects back to this app cross-site,
      // which would be blocked by "strict".
      sameSite: "lax" as const,
    },
  });
  return session;
}

export function isSessionValid(session: Partial<SessionData>): session is SessionData {
  return !!(session.accessToken && session.refreshToken && session.expiresAt);
}
