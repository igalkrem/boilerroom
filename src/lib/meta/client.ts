import { getSession, isSessionValid, isMetaConnected } from "@/lib/session";
import { getUserMetaTokenRow } from "@/lib/db";
import { rateLimitedFetch } from "@/lib/rate-limiter";

import { GRAPH_BASE } from "./graph-version";

/**
 * The Meta access token for the current request, repaired from the database if the
 * session cookie's copy has gone stale.
 *
 * WHY THE FALLBACK EXISTS. This used to read the cookie and nothing else, so a cookie
 * whose `metaExpiresAt` had passed threw `meta_token_expired` forever even when
 * `user_meta_tokens` held a perfectly valid token. That is not hypothetical: on
 * 2026-08-05 production logged 60 `meta_token_expired` errors across /api/meta/adsets,
 * /api/meta/campaigns and /api/meta/page-ad-counts while the stored token was still
 * valid for another 45 days. The cookie and the token have different lifetimes — the
 * session cookie's maxAge is 14 days and `save()` resets that clock, while a Meta token
 * lasts ~60 days and is only ever copied into the cookie at OAuth-callback time — so a
 * long-lived session can carry an expiry older than the stored one indefinitely.
 * Reporting kept working throughout because the cron reads the database directly; only
 * the interactive paths broke. Snapchat never had this class of bug because
 * `getValidAccessToken()` already self-heals.
 *
 * Meta tokens are NOT refreshable, so this only recovers a token someone has already
 * stored. When the stored one really has expired, the error is unchanged and a
 * reconnect is genuinely required.
 */
export async function getValidMetaToken(): Promise<string> {
  const session = await getSession();

  if (!isSessionValid(session)) {
    throw new Error("meta_not_connected");
  }

  // Fast path: the cookie's token is present and still in date.
  if (isMetaConnected(session) && Date.now() < (session.metaExpiresAt ?? 0)) {
    return session.metaAccessToken!;
  }

  const row = await getUserMetaTokenRow(session.googleUserId);
  if (!row) {
    throw new Error("meta_not_connected");
  }
  if (Date.now() >= row.expires_at) {
    throw new Error("meta_token_expired");
  }

  // Repair the cookie so later requests take the fast path. Deliberately does NOT touch
  // `metaAllowedAdAccountIds`: the stored `ad_account_ids` are explicitly NOT an
  // allow-list (see getStoredAdAccountIds in lib/db) and have been observed to drift
  // from the live /me/adaccounts list, so writing them here would swap a live
  // authorization gate for a stale one. Leaving it alone is fail-closed —
  // `isMetaAdAccountAllowed` denies on an empty list, and /api/meta/ad-accounts
  // repopulates it.
  session.metaAccessToken = row.access_token;
  session.metaUserId = row.meta_user_id;
  session.metaExpiresAt = row.expires_at;
  await session.save();

  return row.access_token;
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
