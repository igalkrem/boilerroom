import { sql } from "@vercel/postgres";
import { readFileSync } from "fs";
import path from "path";
import { encryptToken, decryptToken } from "./token-crypto";

export { sql };

let migrated = false;

export async function runMigrations(): Promise<void> {
  if (migrated) return;
  const migrationsPath = path.join(process.cwd(), "src/lib/db/migrations.sql");
  const ddl = readFileSync(migrationsPath, "utf8");
  const statements = ddl
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await sql.query(stmt);
  }

  // Dedup + unique constraint — cannot use DO $$ ... $$ in the SQL file because
  // the semicolon-splitter above would break it. Run conditionally here instead.
  const { rows: existing } = await sql`
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_provider_channels_unique_channel'
  `;
  if (existing.length === 0) {
    // Keep highest-priority status (in-use > cooldown > available); among equals keep oldest row.
    await sql`
      DELETE FROM feed_provider_channels a
      USING feed_provider_channels b
      WHERE a.channel_id       = b.channel_id
        AND a.feed_provider_id = b.feed_provider_id
        AND a.google_user_id   = b.google_user_id
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
    await sql`
      ALTER TABLE feed_provider_channels
        ADD CONSTRAINT feed_provider_channels_unique_channel
        UNIQUE (channel_id, feed_provider_id, google_user_id)
    `;
  }

  migrated = true;
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

export async function listChannels(feedProviderId: string, googleUserId: string): Promise<ChannelRow[]> {
  await normalizeChannelStatuses(feedProviderId, googleUserId);
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
      ON CONFLICT (channel_id, feed_provider_id, google_user_id) DO NOTHING
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
  googleUserId: string
): Promise<string | null> {
  await normalizeChannelStatuses(feedProviderId, googleUserId);
  const { rows } = await sql<ChannelRow>`
    SELECT * FROM feed_provider_channels
    WHERE feed_provider_id = ${feedProviderId}
      AND google_user_id = ${googleUserId}
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

export async function updateChannelAdSquadId(channelId: string, adSquadId: string, googleUserId: string): Promise<void> {
  await sql`
    UPDATE feed_provider_channels
    SET ad_squad_snap_id = ${adSquadId}
    WHERE channel_id = ${channelId}
      AND google_user_id = ${googleUserId}
      AND status = 'in-use'
  `;
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
  const { rows } = await sql<ChannelRow>`
    SELECT * FROM feed_provider_channels
    WHERE google_user_id       = ${googleUserId}
      AND status               = 'in-use'
      AND campaign_snap_id     IS NOT NULL
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

  return rows.map((r) => ({
    google_user_id: r.google_user_id,
    refresh_token: decryptToken(r.refresh_token_enc),
    ad_account_ids: r.ad_account_ids ?? [],
  }));
}

export async function deleteUserToken(googleUserId: string): Promise<void> {
  await sql`DELETE FROM user_snapchat_tokens WHERE google_user_id = ${googleUserId}`;
}
