import { del, list, getDownloadUrl } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";
import { z } from "zod";

const BLOB_HOST = "blob.vercel-storage.com";

const bodySchema = z.object({
  urls: z.array(z.string().min(1)).min(1).max(10),
});

async function fetchUserSiloUrls(googleUserId: string): Promise<Set<string> | null> {
  try {
    const path = `metadata/${googleUserId}/br_silo_assets.json`;
    const { blobs } = await list({ prefix: path });
    const blob = blobs.find((b) => b.pathname === path);
    if (!blob) return new Set(); // user has no silo assets yet — empty set is valid
    const downloadUrl = await getDownloadUrl(blob.url);
    const res = await fetch(downloadUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const assets = await res.json() as Array<{ originalUrl?: string; optimizedUrl?: string; thumbnailUrl?: string }>;
    const owned = new Set<string>();
    for (const a of assets) {
      if (a.originalUrl) owned.add(a.originalUrl);
      if (a.optimizedUrl) owned.add(a.optimizedUrl);
      if (a.thumbnailUrl) owned.add(a.thumbnailUrl);
    }
    return owned;
  } catch {
    return null;
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 422 });
  }

  const { urls } = parsed.data;

  // Validate all URLs are Vercel Blob hostnames before the ownership check
  const invalidHost = urls.filter((u) => {
    try {
      return !new URL(u).hostname.endsWith(BLOB_HOST);
    } catch {
      return true;
    }
  });
  if (invalidHost.length > 0) {
    return NextResponse.json({ error: "invalid_urls" }, { status: 422 });
  }

  // Verify each URL belongs to this user's silo assets
  const ownedUrls = await fetchUserSiloUrls(session.googleUserId);
  if (ownedUrls === null) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  const unowned = urls.filter((u) => !ownedUrls.has(u));
  if (unowned.length > 0) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await del(urls);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
