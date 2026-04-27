import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/snapchat/client";
import { rateLimitedFetch } from "@/lib/rate-limiter";
import { z } from "zod";

export const maxDuration = 60;

const bodySchema = z.object({
  uploadId: z.string().min(1),
  finalizePath: z
    .string()
    .min(1)
    .refine((p) => p.includes("/v1/") && !p.includes("..") && !p.includes("://") && !p.includes("@"), {
      message: "invalid_path",
    }),
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
  const { uploadId, finalizePath } = parsed.data;

  const finalizeUrl = `https://adsapi.snapchat.com${finalizePath}`;

  const form = new FormData();
  form.append("upload_id", uploadId);

  const res = await rateLimitedFetch(() => fetch(finalizeUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  }));

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: `Finalize failed: ${res.status} - ${text}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
