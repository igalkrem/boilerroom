import type { MetaTokenResponse } from "@/types/meta";

const META_GRAPH_BASE = "https://graph.facebook.com/v19.0";
const META_AUTH_URL = "https://www.facebook.com/v19.0/dialog/oauth";

function getMetaEnv() {
  const APP_ID = process.env.META_APP_ID;
  const APP_SECRET = process.env.META_APP_SECRET;
  const REDIRECT_URI = process.env.META_REDIRECT_URI;
  if (!APP_ID || !APP_SECRET || !REDIRECT_URI) {
    throw new Error(
      `Missing required Meta OAuth env vars: ${[
        !APP_ID && "META_APP_ID",
        !APP_SECRET && "META_APP_SECRET",
        !REDIRECT_URI && "META_REDIRECT_URI",
      ]
        .filter(Boolean)
        .join(", ")}`
    );
  }
  return { APP_ID, APP_SECRET, REDIRECT_URI };
}

export function buildAuthUrl(state: string): string {
  const { APP_ID, REDIRECT_URI } = getMetaEnv();
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "ads_read",
    state,
  });
  return `${META_AUTH_URL}?${params.toString()}`;
}

// Exchanges the short-lived authorization code for a short-lived token (~2h).
export async function exchangeCodeForTokens(code: string): Promise<MetaTokenResponse> {
  const { APP_ID, APP_SECRET, REDIRECT_URI } = getMetaEnv();
  const params = new URLSearchParams({
    client_id: APP_ID,
    client_secret: APP_SECRET,
    redirect_uri: REDIRECT_URI,
    code,
  });
  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta token exchange failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<MetaTokenResponse>;
}

// Exchanges a short-lived token for a long-lived token (~60 days).
// Meta has no refresh_token — users must reconnect after expiry.
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokenResponse> {
  const { APP_ID, APP_SECRET } = getMetaEnv();
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: APP_ID,
    client_secret: APP_SECRET,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta long-lived token exchange failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<MetaTokenResponse>;
}

// Fetches the Meta user ID for the authenticated user.
export async function getMeId(accessToken: string): Promise<string> {
  const res = await fetch(`${META_GRAPH_BASE}/me?fields=id&access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta /me fetch failed: ${res.status} ${body}`);
  }
  const data = await res.json() as { id?: string };
  if (!data.id) throw new Error("Meta /me response missing id field");
  return data.id;
}
