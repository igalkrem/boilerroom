import { NextRequest, NextResponse } from "next/server";
import { createAdSet, getAdSet, getAdSetsByAccount, updateAdSet } from "@/lib/meta/adsets";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import type { MetaAdSetPayload } from "@/types/meta";
import { z } from "zod";

export const maxDuration = 60;

const postSchema = z.object({
  adAccountId: z.string().min(1),
  adSet: z.record(z.string(), z.unknown()),
});

const patchSchema = z.object({
  adAccountId: z.string().min(1),
  adSetId: z.string().min(1),
  updates: z.object({
    name: z.string().optional(),
    status: z.enum(["ACTIVE", "PAUSED"]).optional(),
    daily_budget: z.number().optional(),
    bid_amount: z.number().optional(),
  }),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  // Single ad set by ID (used by the meta-debug "Inspect Ad Set" tool)
  const adSetId = request.nextUrl.searchParams.get("adSetId");
  if (adSetId) {
    try {
      const adSet = await getAdSet(adSetId);
      return NextResponse.json({ adSet });
    } catch (err) {
      console.error("[meta/adsets] GET by adSetId error:", err);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  }

  const adAccountId = request.nextUrl.searchParams.get("adAccountId");
  if (!adAccountId) {
    return NextResponse.json({ error: "adAccountId required" }, { status: 400 });
  }
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    console.error(
      `[meta/adsets] GET forbidden: adAccountId=${adAccountId} not in metaAllowedAdAccountIds=${JSON.stringify(session.metaAllowedAdAccountIds)}`
    );
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const adSets = await getAdSetsByAccount(adAccountId);
    return NextResponse.json({ adSets });
  } catch (err) {
    console.error("[meta/adsets] GET error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

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

  const { adAccountId, adSet } = parsed.data;
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await createAdSet(adAccountId, adSet as unknown as MetaAdSetPayload);
    return NextResponse.json({ adSet: result });
  } catch (err) {
    console.error("[meta/adsets] POST error:", err);
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

  const { adAccountId, adSetId, updates } = parsed.data;
  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await updateAdSet(adSetId, updates, adAccountId);
    return NextResponse.json({ success: result.success });
  } catch (err) {
    console.error("[meta/adsets] PATCH error:", err);
    const msg = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("forbidden") ? 403 : 500 });
  }
}
