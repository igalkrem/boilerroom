import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import { getValidMetaToken, metaFetch } from "@/lib/meta/client";
import { createCampaign } from "@/lib/meta/campaigns";
import { createAdSet } from "@/lib/meta/adsets";
import { uploadImage, createAdCreative, buildAdvantagePlusCreativeFeatures } from "@/lib/meta/creatives";
import { createAd } from "@/lib/meta/ads";
import { getOrCreatePageBackedInstagramAccount, isInstagramActorUsableByAdAccount } from "@/lib/meta/business-pages";
import type {
  MetaCampaignPayload,
  MetaAdSetPayload,
  MetaAdCreativePayload,
  MetaAdPayload,
  MetaPixelEvent,
} from "@/types/meta";
import { z } from "zod";
import { deflateSync } from "zlib";

export const maxDuration = 60;

// Generate a solid-color PNG at the given dimensions. Meta's Dynamic Creative
// (asset_feed_spec) rejects tiny images (error_subcode 1885558), so the old
// 1x1 base64 JPEGs can't be used — build 600x600 PNGs on the fly instead.
function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const payload = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([len, payload, crcBuf]);
}

function createTestPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const rowBytes = 1 + width * 3;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const off = y * rowBytes;
    raw[off] = 0;
    for (let x = 0; x < width; x++) {
      const px = off + 1 + x * 3;
      raw[px] = r; raw[px + 1] = g; raw[px + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Debug-only endpoint: replays the exact campaign -> ad set -> creative -> ad
// sequence the wizard's submission orchestrator uses, in one server-side call,
// so a launch failure can be reproduced/iterated on without relaunching the
// wizard each time. Session-gated exactly like every other Meta route — never
// touches any token but the signed-in user's own. Everything it creates is
// PAUSED and named for easy manual cleanup in Ads Manager.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = z
    .object({ adAccountId: z.string().min(1), pageId: z.string().min(1) })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }
  const { adAccountId, pageId } = parsed.data;

  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({
      error: "forbidden",
      detail: `adAccountId ${adAccountId} not in session.metaAllowedAdAccountIds`,
      metaAllowedAdAccountIds: session.metaAllowedAdAccountIds ?? [],
    }, { status: 403 });
  }

  const steps: Record<string, unknown> = {};
  const token = await getValidMetaToken();

  // Mirror the exact bid setup of a known-working reference ad set (campaign
  // 120251719274320745 / "boiler", ad set 120251719276040745) instead of
  // guessing an optimization_goal/bid_strategy combo — this account/objective
  // apparently rejects the implicit LOWEST_COST_WITHOUT_CAP default.
  const REFERENCE_ADSET_ID = "120251719276040745";
  let refFields: {
    optimization_goal?: string;
    billing_event?: string;
    bid_strategy?: string;
    bid_amount?: number;
    bid_constraints?: { roas_average_floor?: number };
    promoted_object?: { pixel_id?: string; custom_event_type?: string };
  } = {};
  try {
    refFields = await metaFetch(
      `/${REFERENCE_ADSET_ID}?fields=optimization_goal,billing_event,bid_strategy,bid_amount,bid_constraints,promoted_object`,
      {},
      token
    );
    steps.referenceAdSet = { ok: true, fields: refFields };
  } catch (err) {
    steps.referenceAdSet = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  let campaignId = "";
  try {
    const campaignPayload: MetaCampaignPayload = {
      name: "ZZZ_DEBUG_TEST — safe to delete",
      status: "PAUSED",
      objective: "OUTCOME_SALES",
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    };
    const result = await createCampaign(adAccountId, campaignPayload, token);
    campaignId = result.id;
    steps.campaign = { ok: true, id: campaignId };
  } catch (err) {
    steps.campaign = { ok: false, error: err instanceof Error ? err.message : String(err) };
    return NextResponse.json({ steps });
  }

  let adSetId = "";
  try {
    const adSetPayload: MetaAdSetPayload = {
      campaign_id: campaignId,
      name: "ZZZ_DEBUG_TEST ad set",
      status: "PAUSED",
      targeting: { geo_locations: { countries: ["US"] } },
      billing_event: (refFields.billing_event as MetaAdSetPayload["billing_event"]) ?? "IMPRESSIONS",
      optimization_goal: (refFields.optimization_goal as MetaAdSetPayload["optimization_goal"]) ?? "VALUE",
      ...(refFields.bid_strategy
        ? { bid_strategy: refFields.bid_strategy as MetaAdSetPayload["bid_strategy"] }
        : {}),
      ...(refFields.bid_amount ? { bid_amount: refFields.bid_amount } : {}),
      ...(refFields.bid_constraints?.roas_average_floor
        ? { bid_constraints: { roas_average_floor: refFields.bid_constraints.roas_average_floor } }
        : {}),
      ...(refFields.promoted_object?.pixel_id
        ? {
            promoted_object: {
              pixel_id: refFields.promoted_object.pixel_id,
              custom_event_type: (refFields.promoted_object.custom_event_type as MetaPixelEvent) ?? "PURCHASE",
            },
          }
        : {}),
      attribution_spec: [{ event_type: "CLICK_THROUGH", window_days: 1 }],
      daily_budget: 500,
    };
    steps.adSetPayloadSent = adSetPayload;
    const result = await createAdSet(adAccountId, adSetPayload, token);
    adSetId = result.id;
    steps.adSet = { ok: true, id: adSetId };
  } catch (err) {
    steps.adSet = { ok: false, error: err instanceof Error ? err.message : String(err) };
    return NextResponse.json({ steps, campaignId });
  }

  let instagramActorId: string | undefined;
  try {
    instagramActorId = await getOrCreatePageBackedInstagramAccount(pageId);
    if (instagramActorId) {
      const usable = await isInstagramActorUsableByAdAccount(adAccountId, instagramActorId, token);
      if (!usable) {
        steps.instagramActor = { ok: true, id: instagramActorId, usableByThisAdAccount: false, omittedFromCreative: true };
        instagramActorId = undefined;
      } else {
        steps.instagramActor = { ok: true, id: instagramActorId, usableByThisAdAccount: true };
      }
    } else {
      steps.instagramActor = { ok: true, id: null };
    }
  } catch (err) {
    steps.instagramActor = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Diagnostic: is this ad account's Business Manager the same one that owns
  // the page (and thus the PBIA)? Meta may only allow an ad account to use a
  // page-backed Instagram account when the ad account and page share a
  // Business Manager (or the page is otherwise shared with that business).
  const rawPageId = pageId; // instagramActorId above may already be nulled by the usability check
  try {
    const acctInfo = await metaFetch<{ id: string; name?: string; business?: { id: string; name?: string } }>(
      `/act_${adAccountId.replace("act_", "")}?fields=id,name,business`,
      {},
      token
    );
    const [pageInfo, acctIgAccounts, businessIgAccounts] = await Promise.all([
      metaFetch<{ id: string; name?: string; instagram_business_account?: { id: string }; connected_instagram_account?: { id: string } }>(
        `/${rawPageId}?fields=id,name,instagram_business_account,connected_instagram_account`,
        {},
        token
      ).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
      metaFetch<{ data?: { id: string; username?: string }[] }>(
        `/act_${adAccountId.replace("act_", "")}/instagram_accounts?fields=id,username`,
        {},
        token
      ).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
      acctInfo.business?.id
        ? metaFetch<{ data?: { id: string; username?: string }[] }>(
            `/${acctInfo.business.id}/instagram_accounts?fields=id,username`,
            {},
            token
          ).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
        : Promise.resolve({ skipped: "no business id on ad account" }),
    ]);
    steps.businessCrossCheck = {
      adAccountBusiness: acctInfo.business ?? null,
      pageInfo,
      adAccountUsableInstagramAccounts: acctIgAccounts,
      businessOwnedInstagramAccounts: businessIgAccounts,
    };
  } catch (err) {
    steps.businessCrossCheck = { error: err instanceof Error ? err.message : String(err) };
  }

  // Upload two distinct 600x600 test images so the creative can use
  // asset_feed_spec (multi-media "Flexible" format).
  const imageHashes: string[] = [];
  const testImages: [string, Buffer][] = [
    ["red", createTestPng(600, 600, 255, 0, 0)],
    ["green", createTestPng(600, 600, 0, 180, 0)],
  ];
  for (const [label, pngBuf] of testImages) {
    try {
      const result = await uploadImage(adAccountId, pngBuf, `debug-test-${label}.png`, token);
      imageHashes.push(result.hash);
      steps[`imageUpload_${label}`] = { ok: true, hash: result.hash };
    } catch (err) {
      steps[`imageUpload_${label}`] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  if (imageHashes.length === 0) {
    return NextResponse.json({ steps, campaignId, adSetId });
  }

  let creativeId = "";
  try {
    const creativePayload: MetaAdCreativePayload = {
      name: "ZZZ_DEBUG_TEST creative",
      ...(instagramActorId ? { instagram_actor_id: instagramActorId } : {}),
      degrees_of_freedom_spec: buildAdvantagePlusCreativeFeatures("IMAGE"),
      object_story_spec: {
        page_id: pageId,
      },
      asset_feed_spec: {
        images: imageHashes.map((hash) => ({ hash })),
        bodies: [{ text: "Debug test" }],
        titles: [{ text: "Debug test" }],
        link_urls: [{ website_url: "https://example.com/" }],
        call_to_action_types: ["LEARN_MORE"],
        ad_formats: ["SINGLE_IMAGE"],
      },
    };
    const result = await createAdCreative(adAccountId, creativePayload, token);
    creativeId = result.id;
    steps.creative = { ok: true, id: creativeId, payloadSent: creativePayload };
  } catch (err) {
    steps.creative = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      payloadSent: { instagram_actor_id: instagramActorId ?? null, page_id: pageId, imageHashes },
    };
    return NextResponse.json({ steps, campaignId, adSetId });
  }

  try {
    const adPayload: MetaAdPayload = {
      name: "ZZZ_DEBUG_TEST ad",
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
    };
    const result = await createAd(adAccountId, adPayload, token);
    steps.ad = { ok: true, id: result.id };
  } catch (err) {
    steps.ad = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({
    steps,
    campaignId,
    adSetId,
    creativeId,
    cleanupHint: `Everything created is PAUSED and named "ZZZ_DEBUG_TEST*" — delete campaign ${campaignId} in Ads Manager when done.`,
  });
}

// DELETE {adAccountId, campaignIds: string[]} — removes throwaway PAUSED test
// campaigns created by this route. Same session-gating as the rest of this
// file; the caller's own token is used, never a stored/DB one.
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = z
    .object({ adAccountId: z.string().min(1), campaignIds: z.array(z.string().min(1)).min(1) })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 422 });
  }
  const { adAccountId, campaignIds } = parsed.data;

  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const token = await getValidMetaToken();
  const results: Record<string, { ok: boolean; error?: string }> = {};

  for (const campaignId of campaignIds) {
    try {
      // IDOR guard: fetch the campaign first and confirm it belongs to the
      // requested (allowed) ad account before deleting anything.
      const campaign = await metaFetch<{ id: string; account_id?: string; name?: string }>(
        `/${campaignId}?fields=id,account_id,name`,
        {},
        token
      );
      const bareAccountId = adAccountId.replace("act_", "");
      if (campaign.account_id !== bareAccountId) {
        results[campaignId] = { ok: false, error: "campaign does not belong to this ad account" };
        continue;
      }
      if (!campaign.name?.startsWith("ZZZ_DEBUG_TEST")) {
        results[campaignId] = { ok: false, error: "refusing to delete a campaign not named ZZZ_DEBUG_TEST*" };
        continue;
      }
      await metaFetch(`/${campaignId}`, { method: "DELETE" }, token);
      results[campaignId] = { ok: true };
    } catch (err) {
      results[campaignId] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ results });
}
