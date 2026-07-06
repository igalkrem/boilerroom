import { getSession, isSessionValid, isMetaConnected } from "@/lib/session";
import { rateLimitedFetch } from "@/lib/rate-limiter";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

export async function getValidMetaToken(): Promise<string> {
  const session = await getSession();

  if (!isSessionValid(session) || !isMetaConnected(session)) {
    throw new Error("meta_not_connected");
  }

  if (Date.now() >= (session.metaExpiresAt ?? 0)) {
    throw new Error("meta_token_expired");
  }

  return session.metaAccessToken!;
}

export async function metaFetch<T>(
  path: string,
  options: RequestInit = {},
  tokenOverride?: string
): Promise<T> {
  const accessToken = tokenOverride ?? (await getValidMetaToken());

  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (!options.body || typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }

  const res = await rateLimitedFetch(() =>
    fetch(url, { ...options, headers })
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}
