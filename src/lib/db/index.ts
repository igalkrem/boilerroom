import { sql } from "@vercel/postgres";
import { readFileSync } from "fs";
import path from "path";

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
  in_use_since: string | null;
  cooldown_since: string | null;
  created_at: string;
}

// ─── Lifecycle normalisation (lazy, called before status-sensitive reads) ──

export async function normalizeChannelStatuses(feedProviderId: string): Promise<void> {
  const now = new Date();
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // in-use → cooldown after 24h
  await sql`
    UPDATE feed_provider_channels
    SET status = 'cooldown', cooldown_since = NOW(), campaign_snap_id = NULL
    WHERE feed_provider_id = ${feedProviderId}
      AND status = 'in-use'
      AND in_use_since < ${h24ago}::timestamptz
  `;

  // cooldown → available after 24h
  await sql`
    UPDATE feed_provider_channels
    SET status = 'available', in_use_since = NULL, cooldown_since = NULL
    WHERE feed_provider_id = ${feedProviderId}
      AND status = 'cooldown'
      AND cooldown_since < ${h24ago}::timestamptz
  `;
}

// ─── Channel queries ───────────────────────────────────────────────────────

export async function listChannels(feedProviderId: string): Promise<ChannelRow[]> {
  await normalizeChannelStatuses(feedProviderId);
  const { rows } = await sql<ChannelRow>`
    SELECT * FROM feed_provider_channels
    WHERE feed_provider_id = ${feedProviderId}
    ORDER BY created_at ASC
  `;
  return rows;
}

export async function bulkInsertChannels(
  feedProviderId: string,
  rows: Array<{ channelId: string; trafficSource: string }>
): Promise<void> {
  for (const row of rows) {
    const id = `${feedProviderId}-${row.channelId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await sql`
      INSERT INTO feed_provider_channels (id, feed_provider_id, channel_id, traffic_source)
      VALUES (${id}, ${feedProviderId}, ${row.channelId}, ${row.trafficSource})
      ON CONFLICT DO NOTHING
    `;
  }
}

export async function deleteChannels(ids: string[]): Promise<void> {
  for (const id of ids) {
    await sql`DELETE FROM feed_provider_channels WHERE id = ${id}`;
  }
}

export async function assignChannel(
  feedProviderId: string,
  campaignSnapId: string
): Promise<string | null> {
  await normalizeChannelStatuses(feedProviderId);
  const { rows } = await sql<ChannelRow>`
    SELECT * FROM feed_provider_channels
    WHERE feed_provider_id = ${feedProviderId} AND status = 'available'
    ORDER BY created_at ASC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  await sql`
    UPDATE feed_provider_channels
    SET status = 'in-use', campaign_snap_id = ${campaignSnapId}, in_use_since = NOW()
    WHERE id = ${row.id}
  `;
  return row.channel_id;
}

export async function releaseChannel(campaignSnapId: string): Promise<void> {
  await sql`
    UPDATE feed_provider_channels
    SET status = 'cooldown', cooldown_since = NOW(), campaign_snap_id = NULL
    WHERE campaign_snap_id = ${campaignSnapId} AND status = 'in-use'
  `;
}
