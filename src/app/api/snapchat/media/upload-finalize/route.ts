import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { uploadId, finalizePath } = await request.json() as {
    uploadId: string;
    finalizePath: string;
  };

  // Validate path to prevent SSRF: must start with /v1/, no traversal or protocol injection
  if (
    typeof finalizePath !== "string" ||
    !finalizePath.startsWith("/v1/") ||
    finalizePath.includes("..") ||
    finalizePath.includes("://") ||
    finalizePath.includes("@")
  ) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const finalizeUrl = `https://adsapi.snapchat.com${finalizePath}`;

  const form = new FormData();
  form.append("upload_id", uploadId);

  const res = await fetch(finalizeUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: `Finalize failed: ${res.status} - ${text}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
