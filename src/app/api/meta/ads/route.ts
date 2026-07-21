import { NextRequest, NextResponse } from "next/server";
import { createAd, updateAd, getAd } from "@/lib/meta/ads";
import { getAdCreative } from "@/lib/meta/creatives";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import type { MetaAdPayload } from "@/types/meta";
import { z } from "zod";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const adId = request.nextUrl.searchParams.get("adId");
  if (!adId) {
    return NextResponse.json({ error: "adId required" }, { status: 400 });
  }

  try {
    const ad = await getAd(adId);
    if (!ad.account_id || !isMetaAdAccountAllowed(session, `act_${ad.account_id}`)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const creativeId = (ad.creative as { id?: string } | undefined)?.id;
    const creative = creativeId ? await getAdCreative(creativeId) : null;
    return NextResponse.json({ ad, creative });
  } catch (err) {
    console.error("[meta/ads] GET error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// Mirrors MetaCreativeAssetGroupsSpec (src/types/meta.ts) — without this,
// Zod's default .strip() behavior silently drops creative_asset_groups_spec
// before it reaches Meta, so the "Flexible" format label never actually
// applies (confirmed live 2026-07-20: a real launched ad had no
// creative_asset_groups_spec at all even though the orchestrator sent it —
// the field never left this route).
const creativeAssetGroupsSpecSchema = z.object({
  origins: z.array(z.string()).optional(),
  groups: z
    .array(
      z.object({
        group_uuid: z.string().optional(),
        call_to_action: z
          .object({ type: z.string(), value: z.object({ link: z.string().optional() }).optional() })
          .optional(),
        images: z.array(z.object({ hash: z.string() })).optional(),
        videos: z
          .array(
            z.object({
              video_id: z.string(),
              thumbnail_url: z.string().optional(),
              thumbnail_hash: z.string().optional(),
            })
          )
          .optional(),
        bodies: z.array(z.object({ text: z.string() })).optional(),
        titles: z.array(z.object({ text: z.string() })).optional(),
      })
    )
    .optional(),
});

const postSchema = z.object({
  adAccountId: z.string().min(1),
  ad: z.object({
    name: z.string().min(1),
    adset_id: z.string().min(1),
    creative: z.object({ creative_id: z.string().min(1) }),
    status: z.enum(["ACTIVE", "PAUSED"]),
    creative_asset_groups_spec: creativeAssetGroupsSpecSchema.optional(),
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
