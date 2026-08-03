import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";
import { isOwnBlobUrl } from "@/lib/blob-host";
import { readUserMetadata } from "@/lib/db/user-metadata";
import { z } from "zod";
import type { CatalogueItem } from "@/types/catalogue";

// Host pinning lives in @/lib/blob-host so all five blob-consuming routes agree.

const bodySchema = z.object({
  urls: z.array(z.string().min(1)).min(1).max(50),
});

// null means "could not establish ownership" → 500, NOT "owns nothing" → empty set.
// See the same note in /api/silo/delete.
async function fetchUserCatalogueUrls(googleUserId: string): Promise<Set<string> | null> {
  let items: unknown;
  try {
    items = await readUserMetadata(googleUserId, "br_catalogue_v1");
  } catch {
    return null; // store unreachable — fail closed
  }
  if (items === null) return new Set();
  if (!Array.isArray(items)) return null; // malformed — fail closed
  return new Set((items as CatalogueItem[]).map((i) => i.url));
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

  const invalidHost = urls.filter((u) => !isOwnBlobUrl(u));
  if (invalidHost.length > 0) {
    return NextResponse.json({ error: "invalid_urls" }, { status: 422 });
  }

  const ownedUrls = await fetchUserCatalogueUrls(session.googleUserId);
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
