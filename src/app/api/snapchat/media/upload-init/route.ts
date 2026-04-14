import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/snapchat/client";
import { rateLimitedCall } from "@/lib/rate-limiter";
import { z } from "zod";

const BASE_URL = process.env.SNAPCHAT_API_BASE_URL ?? "https://adsapi.snapchat.com/v1";

const bodySchema = z.object({
  mediaId: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive().max(500_000_000),
  numberOfParts: z.number().int().min(1).max(1000),
});

export async function POST(request: NextRequest) {
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
  const { mediaId, fileName, fileSize, numberOfParts } = parsed.data;

  const form = new FormData();
  form.append("file_name", fileName);
  form.append("file_size", String(fileSize));
  form.append("number_of_parts", String(numberOfParts));

  const res = await rateLimitedCall(() => fetch(`${BASE_URL}/media/${mediaId}/multipart-upload-v2?action=INIT`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  }));

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: `Init failed: ${res.status} - ${text}` }, { status: 500 });
  }

  const data = JSON.parse(text) as { upload_id?: string; add_path?: string; finalize_path?: string };

  // Snapchat may return full URLs or relative paths — normalize to relative /v1/... paths
  // so the SSRF validation in upload-chunk and upload-finalize always passes.
  function toRelativePath(p: string | undefined): string | undefined {
    if (!p) return p;
    try {
      const url = new URL(p);
      return url.pathname + url.search;
    } catch {
      return p; // already a relative path
    }
  }

  return NextResponse.json({
    ...data,
    add_path: toRelativePath(data.add_path),
    finalize_path: toRelativePath(data.finalize_path),
  });
}
