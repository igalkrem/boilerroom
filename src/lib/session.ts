import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionData } from "@/types/session";

const sessionOptions = {
  cookieName: process.env.SESSION_COOKIE_NAME || "snap_ads_session",
  password: process.env.SESSION_SECRET || "fallback_secret_change_in_production_min_32_chars",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  return session;
}

export function isSessionValid(session: Partial<SessionData>): session is SessionData {
  return !!(session.accessToken && session.refreshToken && session.expiresAt);
}
