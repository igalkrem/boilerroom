import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid, isMetaConnected, isMetaAdAccountAllowed } from "@/lib/session";
import { getValidMetaToken } from "@/lib/meta/client";
import { createCampaign } from "@/lib/meta/campaigns";
import { createAdSet } from "@/lib/meta/adsets";
import { uploadImage, createAdCreative } from "@/lib/meta/creatives";
import { createAd } from "@/lib/meta/ads";
import { getOrCreatePageBackedInstagramAccount } from "@/lib/meta/business-pages";
import type {
  MetaCampaignPayload,
  MetaAdSetPayload,
  MetaAdCreativePayload,
  MetaAdPayload,
} from "@/types/meta";
import { z } from "zod";

export const maxDuration = 60;

// A minimal valid 1x1 red JPEG, used so this route needs no file upload UI.
const TEST_IMAGE_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

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
      billing_event: "LINK_CLICKS",
      optimization_goal: "LINK_CLICKS",
      attribution_spec: [{ event_type: "CLICK_THROUGH", window_days: 1 }],
      daily_budget: 500,
    };
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
    steps.instagramActor = { ok: true, id: instagramActorId ?? null };
  } catch (err) {
    steps.instagramActor = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  let imageHash = "";
  try {
    const result = await uploadImage(adAccountId, Buffer.from(TEST_IMAGE_BASE64, "base64"), "debug-test.jpg", token);
    imageHash = result.hash;
    steps.imageUpload = { ok: true, hash: imageHash };
  } catch (err) {
    steps.imageUpload = { ok: false, error: err instanceof Error ? err.message : String(err) };
    return NextResponse.json({ steps, campaignId, adSetId });
  }

  let creativeId = "";
  try {
    const creativePayload: MetaAdCreativePayload = {
      name: "ZZZ_DEBUG_TEST creative",
      ...(instagramActorId ? { instagram_actor_id: instagramActorId } : {}),
      object_story_spec: {
        page_id: pageId,
        link_data: {
          link: "https://example.com",
          image_hash: imageHash,
          name: "Debug test",
          message: "Debug test",
          call_to_action: { type: "LEARN_MORE", value: { link: "https://example.com" } },
        },
      },
    };
    const result = await createAdCreative(adAccountId, creativePayload, token);
    creativeId = result.id;
    steps.creative = { ok: true, id: creativeId, payloadSent: creativePayload };
  } catch (err) {
    steps.creative = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      payloadSent: { instagram_actor_id: instagramActorId ?? null, page_id: pageId },
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
