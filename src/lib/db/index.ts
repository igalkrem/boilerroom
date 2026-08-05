import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import path from "path";
import { encryptToken, decryptToken } from "./token-crypto";

// Migrated off `@vercel/postgres` (deprecated) on 2026-08-05. That package was a thin
// wrapper whose `sql` template tag called `neon(connectionString, { fullResults: true })`
// internally — this is the same driver and the same HTTP transport, called directly, so
// query semantics and result shapes are unchanged. `fullResults: true` is what keeps
// `{ rows }` on the result; without it the driver returns a bare array and every
// destructuring call site in this file would silently see `rows === undefined`.
//
// Deliberately LAZY, mirroring the Proxy `@vercel/postgres` used. Resolving the
// connection string at module scope would turn a missing POSTGRES_URL into a hard failure
// at import time — including during `next build`, which imports this module — instead of
// at first query.
type NeonSql = NeonQueryFunction<false, true>;

/**
 * The `sql` tag's public type, kept deliberately compatible with the `@vercel/postgres`
 * one so the ~13 `sql<RowType>`...`` call sites did not have to change.
 *
 * `NeonQueryFunction`'s own tagged-template signature takes no type parameter and yields
 * `Record<string, any>[]`, which would have forced a cast at every read site — strictly
 * worse, since a cast is easy to get wrong silently and loses the row shape at the point
 * where it is actually being used.
 *
 * The generic is an ASSERTION, not a validation, exactly as it was under
 * `@vercel/postgres`: nothing checks that the columns you select match `T`. Naming the
 * wrong shape here still compiles and still yields undefined fields at runtime.
 */
interface SqlTag {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...params: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
  query<T = Record<string, unknown>>(
    queryWithPlaceholders: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
}

let client: NeonSql | undefined;

function getClient(): NeonSql {
  if (!client) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error("POSTGRES_URL is not set — cannot connect to Postgres.");
    }
    client = neon(connectionString, { fullResults: true });
  }
  return client;
}

// Supports both call forms the codebase uses: the tagged template (`sql`...``) and
// `sql.query(stmt)` for the raw statements read out of migrations.sql.
export const sql = new Proxy((() => {}) as unknown as SqlTag, {
  apply(_target, _thisArg, args: unknown[]) {
    return (getClient() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop) {
    const c = getClient();
    const value = Reflect.get(c, prop);
    return typeof value === "function" ? value.bind(c) : value;
  },
}) as SqlTag;

let migrated = false;

// SEC-21: survive concurrent cold starts running this DDL at the same time.
//
// `migrated` is per-instance, so a deploy that wakes N serverless instances at once runs
// this whole block N times in parallel. Every statement in migrations.sql is already
// written `IF NOT EXISTS` (10 CREATE TABLE, 9 ADD COLUMN, 4 CREATE INDEX), but those are
// check-then-act inside Postgres and NOT atomic against a concurrent identical statement:
// both instances can see "absent" and both proceed, and the loser gets an error.
//
// THIS REPLACED A pg_advisory_lock THAT NEVER WORKED. Measured on the live database
// 2026-08-05, immediately after `SELECT pg_advisory_lock(key)` on this same `sql`:
// 0 locks visible in pg_locks, `pg_try_advisory_lock` returned true instantly, and
// `pg_advisory_unlock` returned false. The driver sends every query over Neon's HTTP
// endpoint, which does not preserve session state between statements, so a SESSION-level
// advisory lock is discarded the moment the statement returns. It was equally inert under
// `@vercel/postgres` (same HTTP path), so this was never protecting anything.
//
// Tolerating the race is preferred over restoring a real lock. A working lock needs the
// lock and the DDL to share one pinned session — a WebSocket `Client` rather than the HTTP
// callable — which would add a `ws` dependency on Node 20 and, worse, a new way for
// database initialisation to fail. Serialising N instances also makes the slowest cold
// start wait on the others. The DDL is already idempotent by construction; the only gap
// was the error on the losing instance, and that is what this closes. Net effect is the
// same (one instance does the work, the rest find it done) with nothing new to break.
//
// SQLSTATEs measured against this database on 2026-08-05, not taken from documentation —
// note that a duplicate CONSTRAINT reports 42P07 (duplicate_table), not the 42710 you
// would expect, because a UNIQUE constraint creates a backing index:
//
//   CREATE TABLE  on an existing table      -> 42P07 relation already exists
//   ADD CONSTRAINT on an existing constraint -> 42P07 relation already exists
//   ADD COLUMN    on an existing column      -> 42701 column already exists
//
// The list is deliberately narrow. 42P01 (undefined_table) and 42601 (syntax_error) were
// confirmed to fall outside it: a typo or a statement referencing a missing table must
// still fail loudly, because those are bugs in migrations.sql, not races.
const CONCURRENT_DDL_SQLSTATES = new Set([
  "42P07", // duplicate_table — covers tables, indexes and unique constraints
  "42701", // duplicate_column
  "42710", // duplicate_object — not observed above, included for types/other objects
]);

/** Exported for tests only — not part of the module's intended API. */
export function isConcurrentDdlRace(err: unknown): boolean {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && CONCURRENT_DDL_SQLSTATES.has(code);
}

/**
 * Runs one idempotent DDL step, treating "another instance already did this" as success.
 *
 * Only the SQLSTATEs above are swallowed; anything else rethrows. Do not widen this to a
 * bare catch — that would hide real migration bugs until something failed much later, far
 * from the cause.
 */
export async function applyIdempotentDdl(
  label: string,
  run: () => Promise<unknown>
): Promise<void> {
  try {
    await run();
  } catch (err) {
    if (!isConcurrentDdlRace(err)) throw err;
    const code = (err as { code: string }).code;
    console.info(
      `[db] ${label}: already applied by a concurrent instance (SQLSTATE ${code}) — continuing`
    );
  }
}

export async function runMigrations(): Promise<void> {
  if (migrated) return;
  await runMigrationsLocked();
  // Only after every step has either succeeded or been confirmed already-applied.
  migrated = true;
}

async function runMigrationsLocked(): Promise<void> {
  // Idempotent kingsroad_report → visymo_report rename. MUST run before the
  // statement loop below — migrations.sql's `CREATE TABLE IF NOT EXISTS
  // visymo_report` would otherwise pre-create an empty table and make the
  // ALTER TABLE ... RENAME fail with "relation already exists".
  const { rows: renameCheck } = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('kingsroad_report', 'visymo_report')
  `;
  const hasOldReportTable = renameCheck.some((r) => r.table_name === "kingsroad_report");
  const hasNewReportTable = renameCheck.some((r) => r.table_name === "visymo_report");
  if (hasOldReportTable && !hasNewReportTable) {
    // Unreachable against the current database — kingsroad_report no longer exists, so
    // this branch cannot fire. Kept for environments restored from an older snapshot, and
    // wrapped because two instances can both observe old-present/new-absent and race, in
    // which case the loser's RENAME hits an existing visymo_report.
    await applyIdempotentDdl("rename kingsroad_report -> visymo_report", () =>
      sql`ALTER TABLE IF EXISTS kingsroad_report RENAME TO visymo_report`
    );
  }

  const migrationsPath = path.join(process.cwd(), "src/lib/db/migrations.sql");
  const ddl = readFileSync(migrationsPath, "utf8");
  const statements = ddl
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const [i, stmt] of statements.entries()) {
    // The label carries the statement's opening words rather than its index alone, so a
    // rethrown error points at the offending line in migrations.sql without counting.
    await applyIdempotentDdl(
      `migrations.sql statement ${i + 1} (${stmt.slice(0, 60).replace(/\s+/g, " ")})`,
      () => sql.query(stmt)
    );
  }

  // Dedup + unique constraint — cannot use DO $$ ... $$ in the SQL file because
  // the semicolon-splitter above would break it. Run conditionally here instead.
  // v2 includes traffic_source so the same channel_id can exist under both Snap
  // and Meta (channels are per-traffic-source). Supersedes the old 3-column
  // constraint `feed_provider_channels_unique_channel`.
  const { rows: existingV2 } = await sql`
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_provider_channels_unique_channel_v2'
  `;
  if (existingV2.length === 0) {
    // Dedup by the 4-tuple. Keep highest-priority status (in-use > cooldown > available);
    // among equals keep oldest row.
    await sql`
      DELETE FROM feed_provider_channels a
      USING feed_provider_channels b
      WHERE a.channel_id       = b.channel_id
        AND a.feed_provider_id = b.feed_provider_id
        AND a.google_user_id   = b.google_user_id
        AND a.traffic_source   = b.traffic_source
        AND a.id <> b.id
        AND (
          CASE b.status WHEN 'in-use' THEN 2 WHEN 'cooldown' THEN 1 ELSE 0 END
            > CASE a.status WHEN 'in-use' THEN 2 WHEN 'cooldown' THEN 1 ELSE 0 END
          OR (
            CASE b.status WHEN 'in-use' THEN 2 WHEN 'cooldown' THEN 1 ELSE 0 END
              = CASE a.status WHEN 'in-use' THEN 2 WHEN 'cooldown' THEN 1 ELSE 0 END
            AND b.created_at < a.created_at
          )
        )
    `;
    await sql`ALTER TABLE feed_provider_channels DROP CONSTRAINT IF EXISTS feed_provider_channels_unique_channel`;
    // The one step here that is not already self-guarding: the pg_constraint check above
    // is check-then-act, so two instances can both see it absent and both try to add it.
    // The DELETE is a dedup that is harmless to repeat and the DROP has IF EXISTS.
    await applyIdempotentDdl("add feed_provider_channels_unique_channel_v2", () =>
      sql`
        ALTER TABLE feed_provider_channels
          ADD CONSTRAINT feed_provider_channels_unique_channel_v2
          UNIQUE (channel_id, feed_provider_id, google_user_id, traffic_source)
      `
    );
  }
}

// ─── Channel types ─────────────────────────────────────────────────────────

export interface ChannelRow {
  id: string;
  feed_provider_id: string;
  channel_id: string;
  traffic_source: string;
  status: "available" | "in-use" | "cooldown";
  campaign_snap_id: string | null;
  ad_squad_snap_id: string | null;
  in_use_since: string | null;
  cooldown_since: string | null;
  paused_since: string | null;
  created_at: string;
}

// ─── Lifecycle normalisation (lazy, called before status-sensitive reads) ──

export async function normalizeChannelStatuses(feedProviderId: string, googleUserId: string): Promise<void> {
  const now = new Date();
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // in-use → cooldown: only when paused for ≥ 24h (not time-since-assignment)
  await sql`
    UPDATE feed_provider_channels
    SET status = 'cooldown', cooldown_since = NOW(), campaign_snap_id = NULL, paused_since = NULL
    WHERE feed_provider_id = ${feedProviderId}
      AND google_user_id = ${googleUserId}
      AND status = 'in-use'
      AND paused_since IS NOT NULL
      AND paused_since < ${h24ago}::timestamptz
  `;

  // cooldown → available after 24h; clear all lifecycle timestamps
  await sql`
    UPDATE feed_provider_channels
    SET status = 'available', in_use_since = NULL, cooldown_since = NULL, paused_since = NULL
    WHERE feed_provider_id = ${feedProviderId}
      AND google_user_id = ${googleUserId}
      AND status = 'cooldown'
      AND cooldown_since < ${h24ago}::timestamptz
  `;
}

// ─── Channel queries ───────────────────────────────────────────────────────

export async function listChannels(
  feedProviderId: string,
  googleUserId: string,
  trafficSource?: string
): Promise<ChannelRow[]> {
  await normalizeChannelStatuses(feedProviderId, googleUserId);
  if (trafficSource) {
    const { rows } = await sql<ChannelRow>`
      SELECT * FROM feed_provider_channels
      WHERE feed_provider_id = ${feedProviderId} AND google_user_id = ${googleUserId}
        AND traffic_source = ${trafficSource}
      ORDER BY created_at ASC
    `;
    return rows;
  }
  const { rows } = await sql<ChannelRow>`
    SELECT * FROM feed_provider_channels
    WHERE feed_provider_id = ${feedProviderId} AND google_user_id = ${googleUserId}
    ORDER BY created_at ASC
  `;
  return rows;
}

export async function bulkInsertChannels(
  feedProviderId: string,
  rows: Array<{ channelId: string; trafficSource: string }>,
  googleUserId: string
): Promise<void> {
  for (const row of rows) {
    const id = `${feedProviderId}-${row.channelId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await sql`
      INSERT INTO feed_provider_channels (id, feed_provider_id, channel_id, traffic_source, google_user_id)
      VALUES (${id}, ${feedProviderId}, ${row.channelId}, ${row.trafficSource}, ${googleUserId})
      ON CONFLICT (channel_id, feed_provider_id, google_user_id, traffic_source) DO NOTHING
    `;
  }
}

export async function deleteChannels(ids: string[], googleUserId: string): Promise<void> {
  for (const id of ids) {
    await sql`DELETE FROM feed_provider_channels WHERE id = ${id} AND google_user_id = ${googleUserId}`;
  }
}

export async function getInUseChannelsByUser(googleUserId: string): Promise<ChannelRow[]> {
  const { rows } = await sql<ChannelRow>`
    SELECT * FROM feed_provider_channels
    WHERE google_user_id = ${googleUserId}
      AND status = 'in-use'
      AND ad_squad_snap_id IS NOT NULL
    ORDER BY in_use_since ASC
  `;
  return rows;
}

export async function updateChannelPausedStatus(
  adSquadIds: string[],
  googleUserId: string,
  action: "set" | "clear"
): Promise<void> {
  if (adSquadIds.length === 0) return;
  for (const adSquadId of adSquadIds) {
    if (action === "set") {
      // Guard: only stamp if not already stamped — preserves the original pause time
      await sql`
        UPDATE feed_provider_channels
        SET paused_since = NOW()
        WHERE ad_squad_snap_id = ${adSquadId}
          AND google_user_id = ${googleUserId}
          AND status = 'in-use'
          AND paused_since IS NULL
      `;
    } else {
      await sql`
        UPDATE feed_provider_channels
        SET paused_since = NULL
        WHERE ad_squad_snap_id = ${adSquadId}
          AND google_user_id = ${googleUserId}
          AND status = 'in-use'
          AND paused_since IS NOT NULL
      `;
    }
  }
}

export async function assignChannel(
  feedProviderId: string,
  campaignSnapId: string,
  googleUserId: string,
  trafficSource: string = "Snap"
): Promise<string | null> {
  await normalizeChannelStatuses(feedProviderId, googleUserId);
  const { rows } = await sql<ChannelRow>`
    SELECT * FROM feed_provider_channels
    WHERE feed_provider_id = ${feedProviderId}
      AND google_user_id = ${googleUserId}
      AND traffic_source = ${trafficSource}
      AND status = 'available'
    ORDER BY created_at ASC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  await sql`
    UPDATE feed_provider_channels
    SET status = 'in-use', campaign_snap_id = ${campaignSnapId}, in_use_since = NOW()
    WHERE id = ${row.id} AND google_user_id = ${googleUserId}
  `;
  return row.channel_id;
}

export async function forceChannelStatus(
  id: string,
  googleUserId: string,
  newStatus: "available" | "cooldown"
): Promise<void> {
  if (newStatus === "available") {
    await sql`
      UPDATE feed_provider_channels
      SET status = 'available', in_use_since = NULL, cooldown_since = NULL, paused_since = NULL, campaign_snap_id = NULL
      WHERE id = ${id}
        AND google_user_id = ${googleUserId}
        AND status = 'in-use'
    `;
  } else {
    await sql`
      UPDATE feed_provider_channels
      SET status = 'cooldown', cooldown_since = NOW(), paused_since = NULL, campaign_snap_id = NULL
      WHERE id = ${id}
        AND google_user_id = ${googleUserId}
        AND status = 'in-use'
    `;
  }
}

export async function releaseChannel(campaignSnapId: string, googleUserId: string): Promise<void> {
  await sql`
    UPDATE feed_provider_channels
    SET status = 'cooldown', cooldown_since = NOW(), campaign_snap_id = NULL
    WHERE campaign_snap_id = ${campaignSnapId}
      AND google_user_id = ${googleUserId}
      AND status = 'in-use'
  `;
}

export async function updateChannelAdSquadId(channelId: string, adSquadId: string, googleUserId: string, campaignSnapId?: string): Promise<void> {
  if (campaignSnapId) {
    await sql`
      UPDATE feed_provider_channels
      SET ad_squad_snap_id = ${adSquadId}, campaign_snap_id = ${campaignSnapId}
      WHERE channel_id = ${channelId}
        AND google_user_id = ${googleUserId}
        AND status = 'in-use'
    `;
  } else {
    await sql`
      UPDATE feed_provider_channels
      SET ad_squad_snap_id = ${adSquadId}
      WHERE channel_id = ${channelId}
        AND google_user_id = ${googleUserId}
        AND status = 'in-use'
    `;
  }
}

export async function bulkForceChannelStatus(
  feedProviderId: string,
  googleUserId: string,
  newStatus: "available" | "cooldown"
): Promise<number> {
  const { rowCount } = await sql`
    UPDATE feed_provider_channels
    SET
      status           = ${newStatus},
      cooldown_since   = CASE WHEN ${newStatus} = 'cooldown'  THEN NOW() ELSE NULL END,
      in_use_since     = CASE WHEN ${newStatus} = 'available' THEN NULL ELSE in_use_since END,
      paused_since     = NULL,
      campaign_snap_id = NULL
    WHERE feed_provider_id = ${feedProviderId}
      AND google_user_id   = ${googleUserId}
      AND status = 'in-use'
  `;
  return rowCount ?? 0;
}

export async function getInUseChannelsWithoutSquadId(googleUserId: string): Promise<ChannelRow[]> {
  // campaign_snap_id <> '' matters: both orchestrators assign a channel with
  // campaignSnapId: "" and only fill in the real id later via link-squad. An empty
  // string passes IS NOT NULL, so without this filter the backfill pass below issues
  // a lookup against campaign "" on every tick and logs a guaranteed failure.
  const { rows } = await sql<ChannelRow>`
    SELECT * FROM feed_provider_channels
    WHERE google_user_id       = ${googleUserId}
      AND status               = 'in-use'
      AND campaign_snap_id     IS NOT NULL
      AND campaign_snap_id     <> ''
      AND ad_squad_snap_id     IS NULL
    ORDER BY in_use_since ASC
  `;
  return rows;
}

// ─── Snapchat token storage (for server-side cron sync) ────────────────────
// Only the refresh_token is persisted — access tokens are transient and
// fetched fresh at sync time. Tokens are AES-256-GCM encrypted at rest.

export interface UserTokenRow {
  google_user_id: string;
  refresh_token: string; // decrypted
  ad_account_ids: Array<{ id: string; timezone: string }>;
}

export async function upsertUserToken(
  googleUserId: string,
  refreshToken: string
): Promise<void> {
  const enc = encryptToken(refreshToken);
  await sql`
    INSERT INTO user_snapchat_tokens (google_user_id, refresh_token_enc, updated_at)
    VALUES (${googleUserId}, ${enc}, NOW())
    ON CONFLICT (google_user_id)
    DO UPDATE SET refresh_token_enc = EXCLUDED.refresh_token_enc, updated_at = NOW()
  `;
}

export async function updateAdAccountIds(
  googleUserId: string,
  accounts: Array<{ id: string; timezone: string }>
): Promise<void> {
  await sql`
    UPDATE user_snapchat_tokens
    SET ad_account_ids = ${JSON.stringify(accounts)}::jsonb, updated_at = NOW()
    WHERE google_user_id = ${googleUserId}
  `;
}

export async function getAllUserTokens(): Promise<UserTokenRow[]> {
  const { rows } = await sql<{
    google_user_id: string;
    refresh_token_enc: string;
    ad_account_ids: Array<{ id: string; timezone: string }>;
  }>`SELECT google_user_id, refresh_token_enc, ad_account_ids FROM user_snapchat_tokens`;

  // SEC-13: decrypt per row, not in one map that throws on the first bad ciphertext.
  // The cron sweep calls this for EVERY tenant, so a single row encrypted under a
  // rotated SESSION_SECRET (or truncated in storage) used to abort the whole sweep —
  // every other tenant's reporting silently stopped updating. Skip the bad row loudly
  // and keep going.
  const out: UserTokenRow[] = [];
  for (const r of rows) {
    try {
      out.push({
        google_user_id: r.google_user_id,
        refresh_token: decryptToken(r.refresh_token_enc),
        ad_account_ids: r.ad_account_ids ?? [],
      });
    } catch (err) {
      console.error(
        `[db] skipping user ${r.google_user_id}: stored Snapchat refresh token could not be decrypted ` +
          `(re-connect required). Other users are unaffected.`,
        err
      );
    }
  }
  return out;
}

export async function deleteUserToken(googleUserId: string): Promise<void> {
  await sql`DELETE FROM user_snapchat_tokens WHERE google_user_id = ${googleUserId}`;
}

// ─── Meta (Facebook) token storage ─────────────────────────────────────────
// Meta issues long-lived tokens (~60 days) — no refresh token.
// The access token is AES-256-GCM encrypted using the same key as Snapchat tokens.

export interface UserMetaTokenRow {
  google_user_id: string;
  meta_user_id: string;
  access_token: string; // decrypted
  ad_account_ids: Array<{ id: string; currency: string; timezone_name: string }>;
  expires_at: number;   // unix ms
}

export async function upsertUserMetaToken(
  googleUserId: string,
  metaUserId: string,
  accessToken: string,
  expiresAt: number
): Promise<void> {
  const enc = encryptToken(accessToken);
  await sql`
    INSERT INTO user_meta_tokens (google_user_id, meta_user_id, access_token_enc, expires_at, updated_at)
    VALUES (${googleUserId}, ${metaUserId}, ${enc}, ${expiresAt}, NOW())
    ON CONFLICT (google_user_id)
    DO UPDATE SET
      meta_user_id     = EXCLUDED.meta_user_id,
      access_token_enc = EXCLUDED.access_token_enc,
      expires_at       = EXCLUDED.expires_at,
      updated_at       = NOW()
  `;
}

export async function updateMetaAdAccountIds(
  googleUserId: string,
  accounts: Array<{ id: string; currency: string; timezone_name: string }>
): Promise<void> {
  await sql`
    UPDATE user_meta_tokens
    SET ad_account_ids = ${JSON.stringify(accounts)}::jsonb, updated_at = NOW()
    WHERE google_user_id = ${googleUserId}
  `;
}

export async function getAllUserMetaTokens(): Promise<UserMetaTokenRow[]> {
  const { rows } = await sql<{
    google_user_id: string;
    meta_user_id: string;
    access_token_enc: string;
    ad_account_ids: Array<{ id: string; currency: string; timezone_name: string }>;
    expires_at: number;
  }>`SELECT google_user_id, meta_user_id, access_token_enc, ad_account_ids, expires_at FROM user_meta_tokens`;

  // Same per-row isolation as getAllUserSnapchatTokens — see SEC-13 note there.
  const out: UserMetaTokenRow[] = [];
  for (const r of rows) {
    try {
      out.push({
        google_user_id: r.google_user_id,
        meta_user_id: r.meta_user_id,
        access_token: decryptToken(r.access_token_enc),
        ad_account_ids: r.ad_account_ids ?? [],
        expires_at: Number(r.expires_at),
      });
    } catch (err) {
      console.error(
        `[db] skipping user ${r.google_user_id}: stored Meta access token could not be decrypted ` +
          `(re-connect required). Other users are unaffected.`,
        err
      );
    }
  }
  return out;
}

/**
 * The stored Meta token for ONE user, or null.
 *
 * Deliberately not `getAllUserMetaTokens().find(...)`: that decrypts every tenant's
 * token to answer a question about one of them, which is both wasted work and a wider
 * blast radius than the caller needs. A decryption failure here is that user's problem
 * only, so it throws rather than being swallowed — the caller decides what to do.
 */
export async function getUserMetaTokenRow(
  googleUserId: string
): Promise<UserMetaTokenRow | null> {
  const { rows } = await sql<{
    google_user_id: string;
    meta_user_id: string;
    access_token_enc: string;
    ad_account_ids: Array<{ id: string; currency: string; timezone_name: string }>;
    expires_at: number;
  }>`
    SELECT google_user_id, meta_user_id, access_token_enc, ad_account_ids, expires_at
    FROM user_meta_tokens WHERE google_user_id = ${googleUserId}
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    google_user_id: r.google_user_id,
    meta_user_id: r.meta_user_id,
    access_token: decryptToken(r.access_token_enc),
    ad_account_ids: r.ad_account_ids ?? [],
    expires_at: Number(r.expires_at),
  };
}

/**
 * The ad account id lists PERSISTED for one user, ids only — no token decryption.
 *
 * **NOT AN ALLOW-LIST.** `report_sync_log` and the stats tables are keyed by the
 * STORED list, because the cron iterates `getAllUserSnapchatTokens()` /
 * `getAllUserMetaTokens()`, while the session carries the LIVE list from
 * `/me/adaccounts`. The two have been observed to drift (33 entries each, different
 * contents). Unioning them is correct for a MAX-over-timestamps display; gating
 * access on the union would grant a stale account. For authorization use
 * `isAdAccountAllowed` / `isMetaAdAccountAllowed` against the session only.
 */
export async function getStoredAdAccountIds(
  googleUserId: string
): Promise<{ snap: string[]; meta: string[] }> {
  const [snapRes, metaRes] = await Promise.all([
    sql<{ ad_account_ids: Array<{ id: string }> | null }>`
      SELECT ad_account_ids FROM user_snapchat_tokens WHERE google_user_id = ${googleUserId}`,
    sql<{ ad_account_ids: Array<{ id: string }> | null }>`
      SELECT ad_account_ids FROM user_meta_tokens WHERE google_user_id = ${googleUserId}`,
  ]);
  const ids = (rows: Array<{ ad_account_ids: Array<{ id: string }> | null }>) =>
    (rows[0]?.ad_account_ids ?? []).map((a) => a?.id).filter((id): id is string => Boolean(id));
  return { snap: ids(snapRes.rows), meta: ids(metaRes.rows) };
}

export async function deleteUserMetaToken(googleUserId: string): Promise<void> {
  await sql`DELETE FROM user_meta_tokens WHERE google_user_id = ${googleUserId}`;
}
