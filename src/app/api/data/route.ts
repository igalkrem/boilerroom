import { type NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";
import { getSession, isSessionValid } from "@/lib/session";

const VALID_KEYS = ["br_silo_assets", "br_silo_tags", "br_pixels", "br_presets", "br_feed_providers", "br_articles"] as const;
type DataKey = (typeof VALID_KEYS)[number];

function isValidKey(k: string): k is DataKey {
  return (VALID_KEYS as readonly string[]).includes(k);
}

const MAX_BODY_BYTES = 500_000; // 500 KB

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!session.snapUserId) {
    return NextResponse.json({ error: "user_identity_unavailable" }, { status: 403 });
  }

  const key = request.nextUrl.searchParams.get("key");
  if (!key || !isValidKey(key)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  const blobPath = `metadata/${session.snapUserId}/${key}.json`;

  try {
    const { blobs } = await list({ prefix: blobPath });
    const blob = blobs.find((b) => b.pathname === blobPath);
    if (!blob) return NextResponse.json(null);
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return NextResponse.json(null);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null);
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!session.snapUserId) {
    return NextResponse.json({ error: "user_identity_unavailable" }, { status: 403 });
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

  try {
    await put(`metadata/${session.snapUserId}/${key}.json`, JSON.stringify(data), {
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
