import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { getValidAccessToken } from "@/lib/snapchat/client";
import { rateLimitedFetch } from "@/lib/rate-limiter";
import { z } from "zod";

export const maxDuration = 60;

const BASE_URL = process.env.SNAPCHAT_API_BASE_URL ?? "https://adsapi.snapchat.com/v1";

const bodySchema = z.object({
  adAccountId: z.string().min(1),
  mediaId: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive().max(500_000_000),
  numberOfParts: z.number().int().min(1).max(1000),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }
  const { adAccountId, mediaId, fileName, fileSize, numberOfParts } = parsed.data;

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = new FormData();
  form.append("file_name", fileName);
  form.append("file_size", String(fileSize));
  form.append("number_of_parts", String(numberOfParts));

  const res = await rateLimitedFetch(() => fetch(`${BASE_URL}/media/${mediaId}/multipart-upload-v2?action=INIT`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  }));

  const text = await res.text();
  if (!res.ok) {
    console.error("[upload-init] Snapchat error:", res.status, text);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const data = JSON.parse(text) as { upload_id?: string; add_path?: string; finalize_path?: string };

  // Snapchat may return full URLs or relative paths — normalize to relative /v1/... paths
  // so the SSRF validation in upload-chunk and upload-finalize always passes.
  // Paths may be relative to the server root (/v1/media/...) OR relative to the /v1 base
  // (/media/...) — both are normalized to start with /v1/.
  function toRelativePath(p: string | undefined): string | undefined {
    if (!p) return p;
    let path: string;
    try {
      const url = new URL(p);
      path = url.pathname + url.search;
    } catch {
      path = p; // already a relative path
    }
    // Only prepend /v1/ if the path doesn't already contain it.
    // Regional paths like /us/v1/... must be preserved as-is.
    if (!path.includes("/v1/")) {
      path = path.startsWith("/") ? `/v1${path}` : `/v1/${path}`;
    }
    return path;
  }

  return NextResponse.json({
    ...data,
    add_path: toRelativePath(data.add_path),
    finalize_path: toRelativePath(data.finalize_path),
  });
}
