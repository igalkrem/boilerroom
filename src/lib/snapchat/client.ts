import { getSession, isSessionValid } from "@/lib/session";
import { refreshAccessToken } from "@/lib/snapchat/auth";
import { rateLimitedCall } from "@/lib/rate-limiter";

const BASE_URL = "https://adsapi.snapchat.com/v1";

// Refresh token proactively if it expires within 5 minutes
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

async function getValidAccessToken(): Promise<string> {
  const session = await getSession();

  if (!isSessionValid(session)) {
    throw new Error("not_authenticated");
  }

  if (Date.now() >= session.expiresAt - REFRESH_BUFFER_MS) {
    const tokens = await refreshAccessToken(session.refreshToken);
    session.accessToken = tokens.access_token;
    if (tokens.refresh_token) {
      session.refreshToken = tokens.refresh_token;
    }
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    await session.save();
  }

  return session.accessToken;
}

export async function snapFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = await getValidAccessToken();

  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

  const res = await rateLimitedCall(() => fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  }));

  // On 401, try refreshing once and retry
  if (res.status === 401) {
    const session = await getSession();
    if (!isSessionValid(session)) throw new Error("not_authenticated");

    const tokens = await refreshAccessToken(session.refreshToken);
    session.accessToken = tokens.access_token;
    if (tokens.refresh_token) session.refreshToken = tokens.refresh_token;
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    await session.save();

    const retry = await rateLimitedCall(() => fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.access_token}`,
        ...options.headers,
      },
    }));

    if (!retry.ok) {
      const body = await retry.text();
      throw new Error(`Snapchat API error ${retry.status}: ${body}`);
    }
    return retry.json() as Promise<T>;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Snapchat API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}
