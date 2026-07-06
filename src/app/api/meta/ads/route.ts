import { NextRequest, NextResponse } from "next/server";
import { createAd, updateAd } from "@/lib/meta/ads";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import type { MetaAdPayload } from "@/types/meta";
import { z } from "zod";

export const maxDuration = 60;

const postSchema = z.object({
  adAccountId: z.string().min(1),
  ad: z.object({
    name: z.string().min(1),
    adset_id: z.string().min(1),
    creative: z.object({ creative_id: z.string().min(1) }),
    status: z.enum(["ACTIVE", "PAUSED"]),
  }),
});

const patchSchema = z.object({
  adAccountId: z.string().min(1),
  adId: z.string().min(1),
  updates: z.object({
    name: z.string().optional(),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  }),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { adAccountId, ad } = parsed.data;
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await createAd(adAccountId, ad as MetaAdPayload);
    return NextResponse.json({ ad: result });
  } catch (err) {
    console.error("[meta/ads] POST error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { adAccountId, adId, updates } = parsed.data;
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await updateAd(adId, updates, adAccountId);
    return NextResponse.json({ success: result.success });
  } catch (err) {
    console.error("[meta/ads] PATCH error:", err);
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("forbidden") ? 403 : 500 });
  }
}
