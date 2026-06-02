// Facebook Graph API v19.0 — OAuth helpers for Meta Ads connection.
// Meta issues long-lived tokens (~60 days). No refresh token exists —
// users must re-authenticate after expiry.

const GRAPH_BASE = "https://graph.facebook.com/v19.0";
const OAUTH_DIALOG = "https://www.facebook.com/v19.0/dialog/oauth";

export function buildMetaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    state,
    scope: "ads_read",
    response_type: "code",
  });
  return `${OAUTH_DIALOG}?${params.toString()}`;
}

// Step 1 — exchange the authorization code for a short-lived token (~1 hour).
export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    code,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta code exchange failed: ${body}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// Step 2 — upgrade to a long-lived token (~60 days).
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta long-lived token exchange failed: ${body}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function getMetaUserId(accessToken: string): Promise<string> {
  const res = await fetch(
    `${GRAPH_BASE}/me?fields=id&access_token=${encodeURIComponent(accessToken)}`
  );
  if (!res.ok) throw new Error("Failed to fetch Meta user ID");
  const data = (await res.json()) as { id: string };
  return data.id;
}
