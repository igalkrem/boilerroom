import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";

const BASE_URL = process.env.SNAPCHAT_API_BASE_URL ?? "https://adsapi.snapchat.com/v1";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { mediaId, fileName, fileSize, numberOfParts } = await request.json() as {
    mediaId: string;
    fileName: string;
    fileSize: number;
    numberOfParts: number;
  };

  const form = new FormData();
  form.append("file_name", fileName);
  form.append("file_size", String(fileSize));
  form.append("number_of_parts", String(numberOfParts));

  const res = await fetch(`${BASE_URL}/media/${mediaId}/multipart-upload-v2?action=INIT`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: form,
  });

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
