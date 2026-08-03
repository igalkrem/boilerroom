import { type NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";
import { readUserMetadata, writeUserMetadata } from "@/lib/db/user-metadata";

const VALID_KEYS = [
  "br_silo_assets",
  "br_silo_tags",
  "br_pixels",
  "br_meta_pixels",
  "br_presets",
  "br_country_groups",
  "br_feed_providers",
  "br_articles",
  "br_ad_accounts_v1",
  "br_page_configs_v1",
  "br_campaign_changelog",
  "br_catalogue_v1",
  "br_build_log",
] as const;
type DataKey = (typeof VALID_KEYS)[number];

function isValidKey(k: string): k is DataKey {
  return (VALID_KEYS as readonly string[]).includes(k);
}

const MAX_BODY_BYTES = 500_000; // 500 KB

// SEC-8: this store is Postgres (`user_metadata`), not the public Vercel Blob store it
// used to be. readUserMetadata still falls back to the legacy blob once per key and
// self-heals into the DB, so no cutover was needed — see src/lib/db/user-metadata.ts.

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const key = request.nextUrl.searchParams.get("key");
  if (!key || !isValidKey(key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  const userId = session.googleUserId;

  let data: unknown;
  try {
    data = await readUserMetadata(userId, key);
  } catch (err) {
    console.error("[/api/data] read error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // Legacy fallback for accounts whose data was written under the pre-Google snapUserId
  // key. Reads through the same helper, so a hit is self-healed into the DB under the
  // Google id and this branch never fires again for that key.
  if (data === null && session.snapUserId) {
    try {
      const oldData = await readUserMetadata(session.snapUserId, key);
      if (oldData !== null) {
        await writeUserMetadata(userId, key, oldData);
        data = oldData;
      }
    } catch (err) {
      console.warn("[/api/data] snapUserId migration failed:", err);
    }
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const rawBody = await request.text();
  // String.length counts UTF-16 code units, not bytes — a payload of non-ASCII
  // characters could be up to 3x the intended limit. Measure actual bytes.
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: { key?: string; data?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { key, data } = body;
  if (!key || !isValidKey(key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  const userId = session.googleUserId;

  try {
    await writeUserMetadata(userId, key, data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/data] write error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
