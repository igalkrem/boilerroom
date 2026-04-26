import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";
import { z } from "zod";

const BLOB_HOST = "blob.vercel-storage.com";

const bodySchema = z.object({
  urls: z.array(z.string().min(1)).min(1).max(10),
});

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

  // Only allow deleting our own Vercel Blob URLs
  const invalid = urls.filter((u) => {
    try {
      const host = new URL(u).hostname;
      return !host.endsWith(BLOB_HOST);
    } catch {
      return true;
    }
  });
  if (invalid.length > 0) {
    return NextResponse.json({ error: "invalid_urls" }, { status: 422 });
  }

  try {
    await del(urls);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
