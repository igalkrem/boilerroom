import type {
  CampaignFormData,
  AdSquadFormData,
  CreativeFormData,
  SubmissionResults,
  SubmissionStage,
} from "@/types/wizard";
import type { FeedProvider } from "@/types/feed-provider";
import { uploadMediaToSnapchat, uploadBlobToSnapchat } from "@/lib/uploadMediaToSnapchat";
import type {
  SnapCampaignPayload,
  SnapAdSquadPayload,
  SnapCreativePayload,
  SnapAdPayload,
  CreativeType,
} from "@/types/snapchat";

type OnStageChange = (stage: SubmissionStage) => void;

function usdToMicro(usd: number): number {
  return Math.round(usd * 1_000_000);
}

function toIso(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: "${date}"`);
  return d.toISOString();
}

function clampToFuture(iso: string): string {
  const d = new Date(iso);
  return d < new Date() ? new Date().toISOString() : iso;
}

// WEB_VIEW creative type pairs with REMOTE_WEBPAGE ad type — confirmed via live Snapchat UI-created campaign.
// Previously we used SNAP_AD for both (workaround after E1008 when pairing WEB_VIEW creative with SNAP_AD ad).
// REMOTE_WEBPAGE is the correct ad type for WEB_VIEW creatives; call_to_action is valid on WEB_VIEW creatives.
const INTERACTION_TYPE_MAP: Record<string, CreativeType> = {
  SWIPE_TO_OPEN: "SNAP_AD",
  WEB_VIEW: "WEB_VIEW",
  DEEP_LINK: "DEEP_LINK",
};

const AD_TYPE_MAP: Record<string, "SNAP_AD" | "REMOTE_WEBPAGE"> = {
  WEB_VIEW: "REMOTE_WEBPAGE",
  SNAP_AD: "SNAP_AD",
  DEEP_LINK: "SNAP_AD",
};

function buildDemographics(sq: AdSquadFormData): Pick<SnapAdSquadPayload["targeting"], "demographics" | "devices"> {
  const out: Pick<SnapAdSquadPayload["targeting"], "demographics" | "devices"> = {};

  const hasGender = sq.targetingGender && sq.targetingGender !== "ALL";
  const hasAge = sq.minAge || sq.maxAge;
  if (hasGender || hasAge) {
    out.demographics = [{
      ...(hasGender ? { genders: [sq.targetingGender as "MALE" | "FEMALE"] } : {}),
      ...(sq.minAge ? { min_age: sq.minAge } : {}),
      ...(sq.maxAge ? { max_age: sq.maxAge } : {}),
    }];
  }

  // Snapchat targeting.devices uses {os_type, operation} — no device_type field.
  // MOBILE maps to the selected OS (or both iOS+Android if none specified); WEB → os_type "WEB".
  if (sq.targetingDeviceType && sq.targetingDeviceType !== "ALL") {
    if (sq.targetingDeviceType === "WEB") {
      out.devices = [{ os_type: "WEB", operation: "INCLUDE" }];
    } else {
      const osTypes: Array<"iOS" | "ANDROID"> = sq.targetingOsType
        ? [sq.targetingOsType as "iOS" | "ANDROID"]
        : ["iOS", "ANDROID"];
      out.devices = osTypes.map((os) => ({ os_type: os, operation: "INCLUDE" as const }));
    }
  }

  return out;
}

export async function runSubmission(
  adAccountId: string,
  campaigns: CampaignFormData[],
  adSquads: AdSquadFormData[],
  creatives: CreativeFormData[],
  onStage: OnStageChange,
  provider?: FeedProvider
): Promise<SubmissionResults> {
  const results: SubmissionResults = {
    uploadMedia: [],
    campaigns: [],
    adSquads: [],
    creatives: [],
    ads: [],
  };

  // ── Step 0: Upload all media files in parallel ────────────────────────────
  onStage("uploadMedia");

  // Catalogue (Dynamic Collection Ads) still upload a hero image/video — the creative renders a
  // static hero plus dynamic product tiles. So media uploads run for ALL creatives, catalogue or not.

  // mediaIdMap resolves each creative's client UUID → Snapchat media ID.
  // Creatives that already have a mediaId (e.g. re-submission) skip the upload.
  const mediaIdMap = new Map<string, string>();

  console.log(`[orchestrator] uploadMedia: ${creatives.length} creative(s)`, creatives.map(c => ({ id: c.id, hasFile: !!c.mediaFile, mediaId: c.mediaId || null, catalogue: !!c.isCatalogue })));

  // Limit to 2 concurrent uploads — Snapchat returns E3002 when too many uploads
  // hit the same ad account simultaneously (3+ parallel triggers this reliably).
  const UPLOAD_CONCURRENCY = 2;
  const uploadQueue = creatives.map((cr) => async () => {
    // Case 1: cached Snapchat mediaId (Silo pre-upload or re-submission)
    if (!cr.mediaFile && !cr.siloAssetBlobUrl) {
      if (cr.mediaId) {
        mediaIdMap.set(cr.id, cr.mediaId);
        console.log(`[orchestrator] ${cr.name}: using cached mediaId ${cr.mediaId}`);
      } else {
        console.warn(`[orchestrator] ${cr.name}: no mediaFile, no blobUrl, and no mediaId — will be skipped`);
      }
      return;
    }

    // Case 2: Silo asset without cached mediaId — server-side upload (any file size, READY immediately)
    if (cr.siloAssetBlobUrl && !cr.mediaFile) {
      try {
        const mediaId = await uploadBlobToSnapchat(
          cr.siloAssetBlobUrl,
          cr.siloAssetOriginalFileName ?? cr.mediaFileName ?? "media",
          adAccountId,
          cr.siloAssetMediaType ?? "VIDEO",
        );
        mediaIdMap.set(cr.id, mediaId);
        results.uploadMedia.push({ clientId: cr.id, snapId: mediaId, name: cr.name });
      } catch (err) {
        console.error(`[orchestrator] ${cr.name}: silo blob upload failed —`, String(err));
        results.uploadMedia.push({ clientId: cr.id, snapId: "", name: cr.name, error: String(err) });
      }
      return;
    }

    // Case 3: local File (direct drop or small Silo fallback)
    const mediaType = cr.mediaFile!.type.startsWith("video/") ? "VIDEO" : "IMAGE";
    try {
      const mediaId = await uploadMediaToSnapchat(cr.mediaFile!, adAccountId, mediaType);
      mediaIdMap.set(cr.id, mediaId);
      results.uploadMedia.push({ clientId: cr.id, snapId: mediaId, name: cr.name });
    } catch (err) {
      console.error(`[orchestrator] ${cr.name}: upload failed —`, String(err));
      results.uploadMedia.push({ clientId: cr.id, snapId: "", name: cr.name, error: String(err) });
    }
  });

  const runQueue = [...uploadQueue];
  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, uploadQueue.length) }, async () => {
      while (runQueue.length > 0) {
        const task = runQueue.shift();
        if (task) await task();
      }
    })
  );

  console.log(`[orchestrator] mediaIdMap size: ${mediaIdMap.size}`);

  // ── Channel Assignment (provider-supplied channels only) ──────────────────
  let channelId: string | null = null;
  const snapChannelType = provider?.snapConfig?.channelConfig?.type ?? provider?.channelConfig?.type;
  if (snapChannelType === "provider-supplied") {
    try {
      const assignRes = await fetch("/api/feed-providers/channels/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedProviderId: provider!.id, campaignSnapId: "", adAccountId, trafficSource: "Snap" }),
      });
      if (assignRes.ok) {
        const assignData = await assignRes.json() as { channelId?: string | null };
        channelId = assignData.channelId ?? null;
        console.log(`[orchestrator] channel assigned: ${channelId}`);
      } else {
        console.warn("[orchestrator] channel assignment failed:", assignRes.status);
      }
    } catch (err) {
      console.warn("[orchestrator] channel assignment threw:", String(err));
    }

  }

  // Always strip {{channel.id}} from names regardless of channel config type.
  // For provider-supplied channels this replaces with the assigned ID; for all others
  // it replaces with "" to prevent Snapchat from seeing unknown macro syntax (E1001).
  const cid = channelId ?? "";
  const injectChannel = (s: string) => s.replace(/\{\{channel\.id\}\}/gi, cid);
  campaigns = campaigns.map((c)  => ({ ...c,  name: injectChannel(c.name) }));
  adSquads  = adSquads.map((sq)  => ({ ...sq, name: injectChannel(sq.name) }));
  creatives = creatives.map((cr) => ({ ...cr, name: injectChannel(cr.name) }));

  // ── Step 1: Create Campaigns ──────────────────────────────────────────────
  onStage("campaigns");

  const campaignPayloads: SnapCampaignPayload[] = campaigns.map((c) => {
    if (!c.startDate) throw new Error(`Campaign "${c.name}" is missing a start date`);
    return {
      name: c.name,
      ad_account_id: adAccountId,
      status: c.status,
      buy_model: "AUCTION",
      start_time: clampToFuture(toIso(c.startDate)),
      end_time: c.endDate ? toIso(c.endDate) : undefined,
      daily_budget_micro:
        c.spendCapType === "DAILY_BUDGET" && c.dailyBudgetUsd
          ? usdToMicro(c.dailyBudgetUsd)
          : undefined,
      objective_v2_properties: { objective_v2_type: c.objective },
      // Catalogue (Dynamic Collection Ads): campaign declares the catalog_id;
      // squad declares product_set_id; both are required (confirmed from live campaign).
      // Sending child_ad_type or catalog_vertical on the squad triggers E1001 (read-only).
      product_properties: c.catalogId ? { catalog_id: c.catalogId } : undefined,
    };
  });

  const campaignRes = await fetch("/api/snapchat/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adAccountId, campaigns: campaignPayloads }),
  });
  const campaignData = await campaignRes.json() as { results: Array<{ id?: string; name?: string; error?: string }>; error?: string; details?: unknown };
  if (!campaignRes.ok && !campaignData.results) {
    console.error("Campaigns API error:", campaignRes.status, campaignData);
    campaigns.forEach((c) => results.campaigns.push({ clientId: c.id, snapId: "", name: c.name, error: campaignData.error ?? `HTTP ${campaignRes.status}` }));
    onStage("done");
    return results;
  }

  const campaignIdMap = new Map<string, string>();
  campaigns.forEach((c, i) => {
    // Prefer name match (handles out-of-order responses); fall back to positional
    // index because Snapchat does not always echo name in the response object.
    const snap = campaignData.results?.find((r) => r.name === c.name)
      ?? campaignData.results?.[i];
    results.campaigns.push({
      clientId: c.id,
      snapId: snap?.id ?? "",
      name: c.name,
      error: snap?.error ?? (snap === undefined ? "No result returned from API" : undefined),
    });
    if (snap?.id) campaignIdMap.set(c.id, snap.id);
  });

  // ── Step 2: Create Ad Squads (parallel per campaign + error check) ────────
  onStage("adSquads");

  const squadsByCampaignClientId: Record<string, AdSquadFormData[]> = {};
  for (const sq of adSquads) {
    if (!squadsByCampaignClientId[sq.campaignId]) {
      squadsByCampaignClientId[sq.campaignId] = [];
    }
    squadsByCampaignClientId[sq.campaignId].push(sq);
  }

  const squadIdMap = new Map<string, string>();

  // CR-7: run each campaign's ad squad batch in parallel
  await Promise.all(
    Object.entries(squadsByCampaignClientId).map(async ([clientCampaignId, squads]) => {
      const snapCampaignId = campaignIdMap.get(clientCampaignId);
      if (!snapCampaignId) {
        squads.forEach((sq) =>
          results.adSquads.push({
            clientId: sq.id,
            snapId: "",
            name: sq.name,
            error: "Parent campaign failed to create",
          })
        );
        return;
      }

      const payloads: SnapAdSquadPayload[] = squads.map((sq) => ({
        campaign_id: snapCampaignId,
        name: sq.name,
        type: sq.type,
        status: sq.status,
        targeting: {
          geos: sq.geoCountryCodes.map((c) => ({ country_code: c.toLowerCase() })),
          ...buildDemographics(sq),
        },
        delivery_constraint: sq.spendCapType === "LIFETIME_BUDGET" ? "LIFETIME_BUDGET" : "DAILY_BUDGET",
        billing_event: "IMPRESSION",
        optimization_goal: sq.optimizationGoal,
        bid_strategy: sq.bidStrategy,
        bid_micro: sq.bidAmountUsd ? usdToMicro(sq.bidAmountUsd) : undefined,
        daily_budget_micro:
          sq.spendCapType === "DAILY_BUDGET" && sq.dailyBudgetUsd
            ? usdToMicro(sq.dailyBudgetUsd)
            : undefined,
        lifetime_budget_micro:
          sq.spendCapType === "LIFETIME_BUDGET" && sq.lifetimeBudgetUsd
            ? usdToMicro(sq.lifetimeBudgetUsd)
            : undefined,
        // conversion_window only applies to pixel-tracked goals. LANDING_PAGE_VIEW is
        // Snapchat-measured (no pixel event), so sending conversion_window for it triggers E1001.
        // Catalogue (Collection Ads) DO use a pixel + conversion window (confirmed against a live
        // PIXEL_PURCHASE collection squad), so they follow the same rule as regular squads.
        conversion_window: !sq.optimizationGoal.startsWith("PIXEL_") ? undefined : "SWIPE_7DAY",
        pacing_type: "STANDARD",
        start_time: sq.startDate ? clampToFuture(toIso(sq.startDate)) : undefined,
        end_time: sq.endDate ? toIso(sq.endDate) : undefined,
        pixel_id: sq.pixelId || undefined,
        // Catalogue: product_set_id on squad must match creative's dynamic_render_properties.product_set_id (E2840).
        // Do NOT send child_ad_type or catalog_vertical — Snapchat auto-sets them (E1001 if sent explicitly).
        product_properties: sq.productSetId ? { product_set_id: sq.productSetId } : undefined,
        // Smart placement (opt-in per preset). Confirmed via live probe (2026-07-06): sending
        // placement_v2 { config: AUTOMATIC } creates the squad on Snapchat's auto-optimized placement
        // but LOCKS it against all API edits (E2025 "AdSquad was created with placement v2, please
        // update the placement in Ads Manager"). So we send it ONLY when the user explicitly opts in;
        // omitting it (the default) yields Snapchat's default placement and keeps the squad editable
        // in-app. CUSTOM/CONTENT are NOT offered: CONTENT is rejected (E39400) and CUSTOM requires
        // CHAT_FEED (E21011) while still locking the squad.
        placement_v2: sq.smartPlacement ? { config: "AUTOMATIC" as const } : undefined,
      }));

      const sqRes = await fetch("/api/snapchat/adsquads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId, campaignId: snapCampaignId, adsquads: payloads }),
      });
      const sqData = await sqRes.json() as { results: Array<{ id?: string; name?: string; error?: string }>; error?: string };

      // CR-2: handle top-level HTTP failure (no results array)
      if (!sqRes.ok && !sqData.results) {
        squads.forEach((sq) =>
          results.adSquads.push({
            clientId: sq.id,
            snapId: "",
            name: sq.name,
            error: sqData.error ?? `HTTP ${sqRes.status}`,
          })
        );
        return;
      }

      squads.forEach((sq, i) => {
        // Prefer name match; fall back to positional index (Snapchat may not echo name)
        const snap = sqData.results?.find((r) => r.name === sq.name)
          ?? sqData.results?.[i];
        const adSquadError = snap?.error ?? (snap === undefined ? "No result returned from API" : undefined);
        if (adSquadError) {
          console.error(`[orchestrator] adSquad "${sq.name}" failed:`, adSquadError);
        }
        results.adSquads.push({
          clientId: sq.id,
          snapId: snap?.id ?? "",
          name: sq.name,
          error: adSquadError,
        });
        if (snap?.id) squadIdMap.set(sq.id, snap.id);
      });
    })
  );


  // ── Store channel → ad squad mapping (Predicto revenue attribution) ────────
  // After ad squads are created, record which ad squad this channel was assigned
  // to so the reporting JOIN can link Predicto's custom_channel_id → ad_squad_id.
  if (channelId && squadIdMap.size > 0) {
    const firstAdSquadId = [...squadIdMap.values()][0];
    // Include the campaign Snap ID so the backfill cron can find the squad and
    // populate ad_squad_snap_id for channels created before link-squad existed.
    const firstCampaignId = [...campaignIdMap.values()][0] ?? "";
    fetch("/api/feed-providers/channels/link-squad", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, adSquadId: firstAdSquadId, campaignSnapId: firstCampaignId }),
    }).catch((err) => console.warn("[orchestrator] link-squad failed (non-fatal):", String(err)));
  }

  // ── Resolve {{channel.id}} macro ─────────────────────────────────────────
  // {{campaign.id}}, {{adset.id}}, and {{ad.id}} are Snapchat native macros —
  // Snapchat substitutes them at click time, so we leave them as-is.
  // {{channel.id}} is BoilerRoom-specific and must be resolved server-side.
  if (channelId) {
    creatives = creatives.map((cr) => {
      if (!cr.webViewUrl?.includes("{{channel.id}}")) return cr;
      return { ...cr, webViewUrl: cr.webViewUrl.replace(/\{\{channel\.id\}\}/gi, channelId) };
    });
  }

  // ── Step 3: Create Creatives ──────────────────────────────────────────────
  onStage("creatives");

  // Only submit creatives whose media uploaded successfully (catalogue heroes included).
  const uploadedCreatives = creatives.filter((cr) => mediaIdMap.has(cr.id));
  creatives
    .filter((cr) => !mediaIdMap.has(cr.id))
    .forEach((cr) =>
      results.creatives.push({ clientId: cr.id, snapId: "", name: cr.name, error: "Media upload failed" })
    );

  console.log(`[orchestrator] uploadedCreatives: ${uploadedCreatives.length}/${creatives.length}`);

  if (uploadedCreatives.length === 0) {
    console.warn("[orchestrator] all creatives failed upload — skipping profiles/creatives/ads");
    onStage("done");
    return results;
  }

  // Fetch the Snapchat Public Profile ID required in creative payloads (E2652 if absent).
  let snapProfileId: string | null = null;
  console.log(`[orchestrator] fetching profile for adAccountId: ${adAccountId}`);
  try {
    const profRes = await fetch(`/api/snapchat/profiles?adAccountId=${encodeURIComponent(adAccountId)}`);
    const profData = await profRes.json() as { profileId?: string; error?: string };
    snapProfileId = profData.profileId ?? null;
    console.log(`[orchestrator] snapProfileId: ${snapProfileId}`);
  } catch (err) {
    console.error("[orchestrator] profiles fetch threw:", String(err));
    // fetch itself failed; snapProfileId stays null
  }

  if (!snapProfileId) {
    uploadedCreatives.forEach((cr) =>
      results.creatives.push({
        clientId: cr.id,
        snapId: "",
        name: cr.name,
        error: "Could not fetch Snapchat profile ID (E2652) — set SNAPCHAT_PROFILE_ID env var",
      })
    );
    onStage("done");
    return results;
  }

  // ── Catalogue (Collection Ads): create creative elements + interaction zone ──
  // Each COLLECTION creative needs an interaction zone holding 4 product-tile placeholders
  // (creative elements). Build these first; a creative whose zone fails is dropped.
  const izMap = new Map<string, string>(); // creative client id → interaction_zone_id
  for (const cr of uploadedCreatives.filter((c) => c.isCatalogue)) {
    try {
      const elements = Array.from({ length: 4 }, (_, i) => ({
        name: `${cr.name} ${i}`.slice(0, 250),
        type: "BUTTON" as const,
        interaction_type: "WEB_VIEW" as const,
        render_type: "DYNAMIC" as const,
      }));
      const elemRes = await fetch("/api/snapchat/creative-elements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId, elements }),
      });
      const elemData = await elemRes.json() as { results?: Array<{ id?: string; error?: string }> };
      const elemIds = (elemData.results ?? []).map((r) => r.id).filter(Boolean) as string[];
      if (elemIds.length !== 4) {
        throw new Error(elemData.results?.find((r) => r.error)?.error ?? "creative element creation failed");
      }
      const izRes = await fetch("/api/snapchat/interaction-zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adAccountId,
          zones: [{ name: cr.name.slice(0, 250), headline: "MORE", creative_element_ids: elemIds, render_type: "DYNAMIC" }],
        }),
      });
      const izData = await izRes.json() as { results?: Array<{ id?: string; error?: string }> };
      const izId = izData.results?.[0]?.id;
      if (!izId) throw new Error(izData.results?.[0]?.error ?? "interaction zone creation failed");
      izMap.set(cr.id, izId);
    } catch (err) {
      console.error(`[orchestrator] ${cr.name}: collection setup failed —`, String(err));
      results.creatives.push({ clientId: cr.id, snapId: "", name: cr.name, error: `Collection setup failed: ${String(err)}` });
    }
  }

  // Drop catalogue creatives whose interaction zone failed — they cannot be created.
  const buildableCreatives = uploadedCreatives.filter((cr) => !cr.isCatalogue || izMap.has(cr.id));
  if (buildableCreatives.length === 0) {
    console.warn("[orchestrator] no buildable creatives after collection setup — skipping creatives/ads");
    onStage("done");
    return results;
  }

  const creativePayloads: SnapCreativePayload[] = buildableCreatives.map((cr) => {
    // Catalogue (Dynamic Collection Ads) — type COLLECTION, static hero media + dynamic product tiles.
    if (cr.isCatalogue) {
      return {
        ad_account_id: adAccountId,
        name: cr.name,
        type: "COLLECTION" as CreativeType,
        render_type: "STATIC",
        headline: cr.headline || undefined,
        brand_name: cr.brandName || undefined,
        top_snap_media_id: mediaIdMap.get(cr.id) ?? cr.mediaId ?? "",
        profile_properties: { profile_id: snapProfileId! },
        dynamic_render_properties: {
          product_set_id: cr.productSetId!,
          ...(cr.dynamicTemplateId ? { dynamic_template_id: cr.dynamicTemplateId } : {}),
        },
        collection_properties: {
          interaction_zone_id: izMap.get(cr.id)!,
          default_fallback_interaction_type: "WEB_VIEW",
          ...(cr.webViewUrl ? { web_view_properties: { url: cr.webViewUrl } } : {}),
        },
      };
    }
    const creativeType: CreativeType = INTERACTION_TYPE_MAP[cr.interactionType] ?? "SNAP_AD";
    return {
      ad_account_id: adAccountId,
      name: cr.name,
      type: creativeType,
      headline: cr.headline || undefined,
      brand_name: cr.brandName || undefined,
      // call_to_action is not valid on SNAP_AD type creatives (E2002 "call to action must be null")
      call_to_action: creativeType !== "SNAP_AD" && cr.callToAction ? cr.callToAction : undefined,
      top_snap_media_id: mediaIdMap.get(cr.id) ?? cr.mediaId ?? "",
      profile_properties: { profile_id: snapProfileId! },
      web_view_properties:
        cr.interactionType === "WEB_VIEW" && cr.webViewUrl
          ? { url: cr.webViewUrl }
          : undefined,
      deep_link_properties:
        cr.interactionType === "DEEP_LINK" && cr.deepLinkUrl
          ? { deep_link_uri: cr.deepLinkUrl }
          : undefined,
    };
  });

  const crRes = await fetch("/api/snapchat/creatives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adAccountId, creatives: creativePayloads }),
  });
  const crData = await crRes.json() as { results: Array<{ id?: string; name?: string; error?: string }>; error?: string };

  // CR-2: handle top-level HTTP failure
  if (!crRes.ok && !crData.results) {
    console.error("Creatives API error:", crRes.status, crData);
    buildableCreatives.forEach((cr) =>
      results.creatives.push({ clientId: cr.id, snapId: "", name: cr.name, error: crData.error ?? `HTTP ${crRes.status}` })
    );
    onStage("done");
    return results;
  }

  const creativeIdMap = new Map<string, string>();
  buildableCreatives.forEach((cr, i) => {
    // Prefer name match; fall back to positional index (Snapchat may not echo name)
    const snap = crData.results?.find((r) => r.name === cr.name)
      ?? crData.results?.[i];
    results.creatives.push({
      clientId: cr.id,
      snapId: snap?.id ?? "",
      name: cr.name,
      error: snap?.error ?? (snap === undefined ? "No result returned from API" : undefined),
    });
    if (snap?.id) creativeIdMap.set(cr.id, snap.id);
  });

  // ── Step 4: Create Ads (parallel per ad squad + error check + fixed index mapping) ──
  onStage("ads");

  const creativesBySquadId: Record<string, CreativeFormData[]> = {};
  for (const cr of buildableCreatives) {
    if (!creativesBySquadId[cr.adSquadId]) {
      creativesBySquadId[cr.adSquadId] = [];
    }
    creativesBySquadId[cr.adSquadId].push(cr);
  }

  // CR-7: run each ad squad's ad batch in parallel
  await Promise.all(
    Object.entries(creativesBySquadId).map(async ([clientSquadId, squadCreatives]) => {
      const snapSquadId = squadIdMap.get(clientSquadId);
      if (!snapSquadId) {
        squadCreatives.forEach((cr) =>
          results.ads.push({
            clientId: cr.id,
            snapId: "",
            name: cr.name,
            error: "Parent ad set failed to create",
          })
        );
        return;
      }

      // CR-1: separate successfully-created creatives from failed ones so result
      // indices align with the payload array, not the full squadCreatives array.
      const adCreatives = squadCreatives.filter((cr) => creativeIdMap.has(cr.id));
      squadCreatives
        .filter((cr) => !creativeIdMap.has(cr.id))
        .forEach((cr) =>
          results.ads.push({
            clientId: cr.id,
            snapId: "",
            name: cr.name,
            error: "Parent creative failed to create",
          })
        );

      if (adCreatives.length === 0) return;

      const adPayloads: SnapAdPayload[] = adCreatives.map((cr) => {
        const creativeType: CreativeType = INTERACTION_TYPE_MAP[cr.interactionType] ?? "SNAP_AD";
        return {
          ad_squad_id: snapSquadId,
          creative_id: creativeIdMap.get(cr.id)!,
          name: cr.name,
          // Catalogue creatives are COLLECTION; everything else maps from interaction type.
          type: cr.isCatalogue ? "COLLECTION" : (AD_TYPE_MAP[creativeType] ?? "SNAP_AD"),
          // COLLECTION ads require render_type DYNAMIC — Snapchat defaults to STATIC and
          // rejects with E2841 ("Static ads cannot be created under an ad squad with product properties").
          render_type: cr.isCatalogue ? "DYNAMIC" : undefined,
          status: cr.adStatus ?? "ACTIVE",
        };
      });

      const adRes = await fetch("/api/snapchat/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId, adSquadId: snapSquadId, ads: adPayloads }),
      });
      const adData = await adRes.json() as { results: Array<{ id?: string; name?: string; error?: string }>; error?: string };

      // CR-2: handle top-level HTTP failure
      if (!adRes.ok && !adData.results) {
        adCreatives.forEach((cr) =>
          results.ads.push({
            clientId: cr.id,
            snapId: "",
            name: cr.name,
            error: adData.error ?? `HTTP ${adRes.status}`,
          })
        );
        return;
      }

      adCreatives.forEach((cr, i) => {
        // Prefer name match; fall back to positional index (Snapchat may not echo name)
        const snap = adData.results?.find((r) => r.name === cr.name)
          ?? adData.results?.[i];
        results.ads.push({
          clientId: cr.id,
          snapId: snap?.id ?? "",
          name: cr.name,
          error: snap?.error ?? (snap === undefined ? "No result returned from API" : undefined),
        });
      });
    })
  );

  onStage("done");
  return results;
}
