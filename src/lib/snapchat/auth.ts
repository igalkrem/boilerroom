import type { SnapTokenResponse } from "@/types/snapchat";

function getSnapEnv() {
  const TOKEN_URL = process.env.SNAPCHAT_TOKEN_URL;
  const CLIENT_ID = process.env.SNAPCHAT_CLIENT_ID;
  const CLIENT_SECRET = process.env.SNAPCHAT_CLIENT_SECRET;
  const REDIRECT_URI = process.env.SNAPCHAT_REDIRECT_URI;
  if (!TOKEN_URL || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error(
      `Missing required Snapchat OAuth env vars: ${[
        !TOKEN_URL && "SNAPCHAT_TOKEN_URL",
        !CLIENT_ID && "SNAPCHAT_CLIENT_ID",
        !CLIENT_SECRET && "SNAPCHAT_CLIENT_SECRET",
        !REDIRECT_URI && "SNAPCHAT_REDIRECT_URI",
      ]
        .filter(Boolean)
        .join(", ")}`
    );
  }
  return { TOKEN_URL, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI };
}

// Hardcoded — same treatment as SNAPCHAT_API_BASE_URL — prevents env-var misconfiguration
// from redirecting OAuth state tokens to an attacker-controlled server.
const SNAPCHAT_AUTH_URL = "https://accounts.snapchat.com/login/oauth2/authorize";

export function buildAuthUrl(state: string): string {
  const { CLIENT_ID, REDIRECT_URI } = getSnapEnv();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "snapchat-marketing-api",
    state,
  });
  return `${SNAPCHAT_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<SnapTokenResponse> {
  const { TOKEN_URL, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = getSnapEnv();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<SnapTokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<SnapTokenResponse> {
  const { TOKEN_URL, CLIENT_ID, CLIENT_SECRET } = getSnapEnv();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<SnapTokenResponse>;
}
