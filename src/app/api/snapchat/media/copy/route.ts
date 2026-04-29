import { NextRequest, NextResponse } from "next/server";
import { snapFetch } from "@/lib/snapchat/client";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { z } from "zod";

const bodySchema = z.object({
  sourceAdAccountId: z.string().min(1),
  destinationAdAccountId: z.string().min(1),
  mediaIds: z.array(z.string().min(1)).min(1).max(20),
});

interface MediaCopyResponseItem {
  sub_request_status: string;
  media?: { id: string };
  sub_request_error_reason?: string;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }


  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { sourceAdAccountId, destinationAdAccountId, mediaIds } = parsed.data;

  if (!isAdAccountAllowed(session, destinationAdAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isAdAccountAllowed(session, sourceAdAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const payload = {
      media: mediaIds.map((media_id) => ({
        ad_account_id: sourceAdAccountId,
        media_id,
      })),
    };

    const data = await snapFetch<{ media: MediaCopyResponseItem[] }>(
      `/adaccounts/${destinationAdAccountId}/media_copy`,
      { method: "POST", body: JSON.stringify(payload) }
    );

    const results = (data.media ?? []).map((item, i) => ({
      sourceMediaId: mediaIds[i],
      newMediaId: item.media?.id ?? null,
      status: item.sub_request_status,
      error: item.sub_request_error_reason ?? null,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[media/copy] error:", err);
    const msg = String(err);
    // Org-mismatch errors should be retried by the caller via full re-upload
    const isOrgMismatch = msg.includes("different organization") || msg.includes("org") || msg.includes("E2");
    return NextResponse.json(
      { error: "internal_error", orgMismatch: isOrgMismatch },
      { status: isOrgMismatch ? 422 : 500 }
    );
  }
}
