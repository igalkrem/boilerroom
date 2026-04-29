import { type NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";
import { getSession, isSessionValid } from "@/lib/session";

const VALID_KEYS = [
  "br_silo_assets",
  "br_silo_tags",
  "br_pixels",
  "br_presets",
  "br_feed_providers",
  "br_articles",
  "br_ad_accounts_v1",
] as const;
type DataKey = (typeof VALID_KEYS)[number];

function isValidKey(k: string): k is DataKey {
  return (VALID_KEYS as readonly string[]).includes(k);
}

const MAX_BODY_BYTES = 500_000; // 500 KB

async function fetchBlob(path: string): Promise<unknown | null> {
  try {
    const { blobs } = await list({ prefix: path });
    const blob = blobs.find((b) => b.pathname === path);
    if (!blob) return null;
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

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
  const newPath = `metadata/${userId}/${key}.json`;

  // Try the Google-keyed path first
  let data = await fetchBlob(newPath);

  // One-time migration: if not found and old snapUserId path exists, copy it over
  if (data === null && session.snapUserId) {
    const oldPath = `metadata/${session.snapUserId}/${key}.json`;
    const oldData = await fetchBlob(oldPath);
    if (oldData !== null) {
      try {
        await put(newPath, JSON.stringify(oldData), {
          access: "public",
          allowOverwrite: true,
          addRandomSuffix: false,
          cacheControlMaxAge: 60,
        });
      } catch (err) {
        console.warn("[/api/data] migration put failed:", err);
      }
      data = oldData;
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
  if (rawBody.length > MAX_BODY_BYTES) {
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
    await put(`metadata/${userId}/${key}.json`, JSON.stringify(data), {
      access: "public",
      allowOverwrite: true,
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/data] put error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
