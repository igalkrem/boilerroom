import type {
  CampaignFormData,
  AdSquadFormData,
  CreativeFormData,
  SubmissionResults,
  SubmissionStage,
} from "@/types/wizard";
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
  APP_INSTALL: "APP_INSTALL",
};

const AD_TYPE_MAP: Record<string, "SNAP_AD" | "REMOTE_WEBPAGE"> = {
  WEB_VIEW: "REMOTE_WEBPAGE",
  SNAP_AD: "SNAP_AD",
  DEEP_LINK: "SNAP_AD",
  APP_INSTALL: "SNAP_AD",
};

function buildDemographics(sq: AdSquadFormData): Pick<SnapAdSquadPayload["targeting"], "demographics" | "devices"> {
  const out: Pick<SnapAdSquadPayload["targeting"], "demographics" | "devices"> = {};

  const hasGender = sq.targetingGender && sq.targetingGender !== "ALL";
  if (hasGender) {
    out.demographics = [{
      genders: [sq.targetingGender as "MALE" | "FEMALE"],
    }];
  }

  if (sq.targetingDeviceType && sq.targetingDeviceType !== "ALL") {
    out.devices = [{
      device_type: sq.targetingDeviceType as "MOBILE" | "WEB",
      ...(sq.targetingOsType ? { os_type: sq.targetingOsType } : {}),
    }];
  }

  return out;
}

export async function runSubmission(
  adAccountId: string,
  campaigns: CampaignFormData[],
  adSquads: AdSquadFormData[],
  creatives: CreativeFormData[],
  onStage: OnStageChange
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

  // mediaIdMap resolves each creative's client UUID → Snapchat media ID.
  // Creatives that already have a mediaId (e.g. re-submission) skip the upload.
  const mediaIdMap = new Map<string, string>();

  console.log(`[orchestrator] uploadMedia: ${creatives.length} creative(s)`, creatives.map(c => ({ id: c.id, hasFile: !!c.mediaFile, mediaId: c.mediaId || null })));

  await Promise.all(
    creatives.map(async (cr) => {
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
    })
  );

  console.log(`[orchestrator] mediaIdMap size: ${mediaIdMap.size}`);

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
        placement_v2: { config: sq.placementConfig ?? "AUTOMATIC" },
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
        conversion_window: "SWIPE_7DAY",
        pacing_type: "STANDARD",
        start_time: sq.startDate ? clampToFuture(toIso(sq.startDate)) : undefined,
        end_time: sq.endDate ? toIso(sq.endDate) : undefined,
        pixel_id: sq.pixelId || undefined,
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
        results.adSquads.push({
          clientId: sq.id,
          snapId: snap?.id ?? "",
          name: sq.name,
          error: snap?.error ?? (snap === undefined ? "No result returned from API" : undefined),
        });
        if (snap?.id) squadIdMap.set(sq.id, snap.id);
      });
    })
  );

  // ── Step 3: Create Creatives ──────────────────────────────────────────────
  onStage("creatives");

  // Only submit creatives whose media uploaded successfully
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

  const creativePayloads: SnapCreativePayload[] = uploadedCreatives.map((cr) => {
    const creativeType: CreativeType = INTERACTION_TYPE_MAP[cr.interactionType] ?? "SNAP_AD";
    return {
      ad_account_id: adAccountId,
      name: cr.name,
      type: creativeType,
      headline: cr.headline,
      brand_name: cr.brandName || undefined,
      // call_to_action is not valid on SNAP_AD type creatives (E2002 "call to action must be null")
      call_to_action: creativeType !== "SNAP_AD" && cr.callToAction ? cr.callToAction : undefined,
      top_snap_media_id: mediaIdMap.get(cr.id) ?? cr.mediaId ?? "",
      ...(snapProfileId ? { profile_properties: { profile_id: snapProfileId } } : {}),
      web_view_properties:
        cr.interactionType === "WEB_VIEW" && cr.webViewUrl
          ? { url: cr.webViewUrl }
          : undefined,
      deep_link_properties:
        cr.interactionType === "DEEP_LINK" && cr.deepLinkUrl
          ? { deep_link_url: cr.deepLinkUrl }
          : undefined,
      app_install_properties:
        cr.interactionType === "APP_INSTALL" && cr.deepLinkUrl
          ? { app_link_url: cr.deepLinkUrl }
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
    uploadedCreatives.forEach((cr) =>
      results.creatives.push({ clientId: cr.id, snapId: "", name: cr.name, error: crData.error ?? `HTTP ${crRes.status}` })
    );
    onStage("done");
    return results;
  }

  const creativeIdMap = new Map<string, string>();
  uploadedCreatives.forEach((cr, i) => {
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
  for (const cr of uploadedCreatives) {
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
          type: AD_TYPE_MAP[creativeType] ?? "SNAP_AD",
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
