import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";
import { isOwnBlobUrl } from "@/lib/blob-host";
import { readUserMetadata } from "@/lib/db/user-metadata";
import { z } from "zod";

// Host pinning lives in @/lib/blob-host so all five blob-consuming routes agree.

const bodySchema = z.object({
  urls: z.array(z.string().min(1)).min(1).max(10),
});

// Returns null to mean "could not establish ownership" — the caller turns that into a
// 500 rather than a delete. Distinguishing that from "user simply has no assets yet"
// (an empty set, which legitimately authorizes nothing) is the whole point of the
// nullable return, so keep the two cases apart.
async function fetchUserSiloUrls(googleUserId: string): Promise<Set<string> | null> {
  let assets: unknown;
  try {
    assets = await readUserMetadata(googleUserId, "br_silo_assets");
  } catch {
    return null; // store unreachable — fail closed
  }
  if (assets === null) return new Set(); // no silo assets yet — empty set is valid
  if (!Array.isArray(assets)) return null; // malformed — fail closed

  const owned = new Set<string>();
  for (const a of assets as Array<{
    originalUrl?: string;
    optimizedUrl?: string;
    thumbnailUrl?: string;
  }>) {
    if (a.originalUrl) owned.add(a.originalUrl);
    if (a.optimizedUrl) owned.add(a.optimizedUrl);
    if (a.thumbnailUrl) owned.add(a.thumbnailUrl);
  }
  return owned;
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
  const invalidHost = urls.filter((u) => !isOwnBlobUrl(u));
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
