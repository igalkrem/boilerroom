import { list, getDownloadUrl } from "@vercel/blob";
import { sql, runMigrations } from "./index";

/**
 * User configuration store (SEC-8).
 *
 * This data used to live as JSON in the `boilerroom-silo` Vercel Blob store at
 * `metadata/{googleUserId}/{key}.json` with `access: "public"` and
 * `addRandomSuffix: false`. That combination made every path deterministic, and
 * `/api/auth/session` returns `googleUserId` to the browser — so the "unguessable URL"
 * the design leaned on was not actually secret. Confirmed against production on
 * 2026-08-03: `br_feed_providers`, `br_presets`, `br_pixels`, `br_meta_pixels` and
 * `br_build_log` all returned HTTP 200 to an unauthenticated curl.
 *
 * What was exposed is the business configuration — revenue-source mapping, ad account
 * and page ids, bidding strategies, budgets, ROAS floors, and the full launch history.
 * (Pixel ids were in there too, but they are the *least* sensitive part: a pixel id is
 * embedded in the tracking JS of every page it fires on, so it is public by design.
 * Moving only the pixel ids, as was first proposed, would have left the actually
 * sensitive records readable.)
 *
 * Postgres was chosen over a private blob store + signed reads because the entire
 * consumer surface is server-side — six call sites, no client ever fetches these URLs —
 * so there is nothing to sign for, and this app already has per-user-scoped Postgres.
 *
 * READS are DB-first with a one-time fallback to the legacy blob, which self-heals by
 * writing what it finds into the DB. That means no flag-day cutover: the first dashboard
 * load after deploy migrates every key, because KVHydrationProvider reads them all.
 * WRITES only ever go to Postgres — continuing to write the blob would keep the
 * exposure alive, which is the whole point of the change.
 *
 * NOTE: migrating the data does NOT by itself remediate anything. The already-public
 * blob copies must be DELETED; until then the old snapshot is still served.
 *
 * JSONB DOES NOT PRESERVE OBJECT KEY ORDER (it stores keys sorted) and collapses
 * duplicate keys. Array order IS preserved. Verified on the real production payloads
 * that a blob->DB round-trip is semantically identical for every key and differs only
 * in key ordering, which nothing here depends on because all access is by key name. But
 * do not byte-compare or hash these payloads to detect change, and do not add a consumer
 * that relies on insertion order — use an array if order ever needs to carry meaning.
 */

// Sentinel owner for the one cache that is deliberately shared across users (a Facebook
// page's page-backed Instagram account never changes, so it is cached globally). Real
// Google user ids are numeric, so this can never collide with one.
export const GLOBAL_OWNER = "__global__";

function legacyBlobPath(owner: string, key: string): string {
  return owner === GLOBAL_OWNER
    ? `metadata/global/${key}.json`
    : `metadata/${owner}/${key}.json`;
}

async function readLegacyBlob(owner: string, key: string): Promise<unknown | null> {
  try {
    const path = legacyBlobPath(owner, key);
    const { blobs } = await list({ prefix: path });
    const blob = blobs.find((b) => b.pathname === path);
    if (!blob) return null;
    const downloadUrl = await getDownloadUrl(blob.url);
    const res = await fetch(downloadUrl, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export async function readUserMetadata(owner: string, key: string): Promise<unknown | null> {
  await runMigrations();

  const { rows } = await sql<{ data: unknown }>`
    SELECT data FROM user_metadata WHERE google_user_id = ${owner} AND key = ${key}
  `;
  if (rows.length > 0) return rows[0].data;

  // Not in Postgres yet — fall back to the pre-SEC-8 blob and self-heal.
  const legacy = await readLegacyBlob(owner, key);
  if (legacy === null) return null;

  try {
    await writeUserMetadata(owner, key, legacy);
  } catch (err) {
    // A failed backfill must not fail the read: the caller still gets correct data, and
    // the next read tries again.
    console.warn(`[user-metadata] backfill of ${owner}/${key} failed:`, err);
  }
  return legacy;
}

export async function writeUserMetadata(
  owner: string,
  key: string,
  data: unknown
): Promise<void> {
  await runMigrations();

  // JSON.stringify + ::jsonb rather than passing the object: @vercel/postgres would
  // otherwise serialise a plain object to "[object Object]".
  await sql`
    INSERT INTO user_metadata (google_user_id, key, data, updated_at)
    VALUES (${owner}, ${key}, ${JSON.stringify(data)}::jsonb, NOW())
    ON CONFLICT (google_user_id, key)
    DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `;
}
