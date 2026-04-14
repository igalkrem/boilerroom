import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/snapchat/client";
import { rateLimitedCall } from "@/lib/rate-limiter";

export async function POST(request: NextRequest) {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const chunk = formData.get("chunk") as File | null;
  const partNumber = formData.get("partNumber") as string | null;
  const uploadId = formData.get("uploadId") as string | null;
  const addPath = formData.get("addPath") as string | null;

  if (!chunk || !partNumber || !uploadId || !addPath) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // Validate path to prevent SSRF: must start with /v1/, no traversal or protocol injection
  if (
    !addPath.startsWith("/v1/") ||
    addPath.includes("..") ||
    addPath.includes("://") ||
    addPath.includes("@")
  ) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const addUrl = `https://adsapi.snapchat.com${addPath}`;

  const uploadForm = new FormData();
  uploadForm.append("file", chunk);
  uploadForm.append("part_number", partNumber);
  uploadForm.append("upload_id", uploadId);

  const res = await rateLimitedCall(() => fetch(addUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: uploadForm,
  }));

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: `Chunk ${partNumber} failed: ${res.status} - ${text}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
