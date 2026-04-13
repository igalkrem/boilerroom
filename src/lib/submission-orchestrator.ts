import type {
  CampaignFormData,
  AdSquadFormData,
  CreativeFormData,
  SubmissionResults,
  SubmissionStage,
} from "@/types/wizard";
import type {
  SnapCampaignPayload,
  SnapAdSquadPayload,
  SnapCreativePayload,
  SnapAdPayload,
} from "@/types/snapchat";

type OnStageChange = (stage: SubmissionStage) => void;

function usdToMicro(usd: number): number {
  return Math.round(usd * 1_000_000);
}

function toIso(date: string): string {
  return new Date(date).toISOString();
}

export async function runSubmission(
  adAccountId: string,
  campaigns: CampaignFormData[],
  adSquads: AdSquadFormData[],
  creatives: CreativeFormData[],
  onStage: OnStageChange
): Promise<SubmissionResults> {
  const results: SubmissionResults = {
    campaigns: [],
    adSquads: [],
    creatives: [],
    ads: [],
  };

  // ── Step 1: Create Campaigns ──────────────────────────────────────────────
  onStage("campaigns");

  const campaignPayloads: SnapCampaignPayload[] = campaigns.map((c) => ({
    name: c.name,
    ad_account_id: adAccountId,
    status: c.status,
    start_time: toIso(c.startDate),
    end_time: c.endDate ? toIso(c.endDate) : undefined,
    daily_budget_micro: usdToMicro(c.dailyBudgetUsd),
    objective_v2_properties: { objective_v2_type: c.objective },
  }));

  const campaignRes = await fetch("/api/snapchat/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adAccountId, campaigns: campaignPayloads }),
  });
  const campaignData = await campaignRes.json() as { results: Array<{ id?: string; error?: string }> };

  // Map client ID → snap ID
  const campaignIdMap = new Map<string, string>();
  campaigns.forEach((c, i) => {
    const snap = campaignData.results?.[i];
    results.campaigns.push({
      clientId: c.id,
      snapId: snap?.id ?? "",
      name: c.name,
      error: snap?.error,
    });
    if (snap?.id) campaignIdMap.set(c.id, snap.id);
  });

  // ── Step 2: Create Ad Squads (grouped by campaign) ────────────────────────
  onStage("adSquads");

  // Group ad squads by campaign client ID
  const squadsByCampaignClientId: Record<string, AdSquadFormData[]> = {};
  for (const sq of adSquads) {
    if (!squadsByCampaignClientId[sq.campaignId]) {
      squadsByCampaignClientId[sq.campaignId] = [];
    }
    squadsByCampaignClientId[sq.campaignId].push(sq);
  }

  const squadIdMap = new Map<string, string>();

  for (const clientCampaignId of Object.keys(squadsByCampaignClientId)) {
    const squads: AdSquadFormData[] = squadsByCampaignClientId[clientCampaignId];
    const snapCampaignId = campaignIdMap.get(clientCampaignId);
    if (!snapCampaignId) {
      squads.forEach((sq: AdSquadFormData) =>
        results.adSquads.push({
          clientId: sq.id,
          snapId: "",
          name: sq.name,
          error: "Parent campaign failed to create",
        })
      );
      continue;
    }

    const payloads: SnapAdSquadPayload[] = squads.map((sq: AdSquadFormData) => ({
      campaign_id: snapCampaignId,
      name: sq.name,
      type: sq.type,
      status: sq.status,
      targeting: { geo_locations: [{ country_code: sq.geoCountryCode }] },
      placement_v2: { config: "AUTOMATIC" },
      billing_event: "IMPRESSION",
      optimization_goal: sq.optimizationGoal,
      bid_strategy: sq.bidStrategy,
      bid_micro: sq.bidAmountUsd ? usdToMicro(sq.bidAmountUsd) : undefined,
      daily_budget_micro: usdToMicro(sq.dailyBudgetUsd),
    }));

    const sqRes = await fetch("/api/snapchat/adsquads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: snapCampaignId, adsquads: payloads }),
    });
    const sqData = await sqRes.json() as { results: Array<{ id?: string; error?: string }> };

    squads.forEach((sq: AdSquadFormData, i: number) => {
      const snap = sqData.results?.[i];
      results.adSquads.push({
        clientId: sq.id,
        snapId: snap?.id ?? "",
        name: sq.name,
        error: snap?.error,
      });
      if (snap?.id) squadIdMap.set(sq.id, snap.id);
    });
  }

  // ── Step 3: Create Creatives ──────────────────────────────────────────────
  onStage("creatives");

  const creativePayloads: SnapCreativePayload[] = creatives.map((cr: CreativeFormData) => ({
    ad_account_id: adAccountId,
    name: cr.name,
    type: "SNAP_AD",
    headline: cr.headline,
    brand_name: cr.brandName,
    call_to_action: cr.callToAction,
    top_snap_media_id: cr.mediaId ?? "",
  }));

  const crRes = await fetch("/api/snapchat/creatives", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adAccountId, creatives: creativePayloads }),
  });
  const crData = await crRes.json() as { results: Array<{ id?: string; error?: string }> };

  const creativeIdMap = new Map<string, string>();
  creatives.forEach((cr: CreativeFormData, i: number) => {
    const snap = crData.results?.[i];
    results.creatives.push({
      clientId: cr.id,
      snapId: snap?.id ?? "",
      name: cr.name,
      error: snap?.error,
    });
    if (snap?.id) creativeIdMap.set(cr.id, snap.id);
  });

  // ── Step 4: Create Ads (one per creative, linked to its ad squad) ─────────
  onStage("ads");

  // Group creatives by ad squad
  const creativesBySquadId: Record<string, CreativeFormData[]> = {};
  for (const cr of creatives) {
    if (!creativesBySquadId[cr.adSquadId]) {
      creativesBySquadId[cr.adSquadId] = [];
    }
    creativesBySquadId[cr.adSquadId].push(cr);
  }

  for (const clientSquadId of Object.keys(creativesBySquadId)) {
    const squadCreatives: CreativeFormData[] = creativesBySquadId[clientSquadId];
    const snapSquadId = squadIdMap.get(clientSquadId);
    if (!snapSquadId) {
      squadCreatives.forEach((cr: CreativeFormData) =>
        results.ads.push({
          clientId: cr.id,
          snapId: "",
          name: cr.name,
          error: "Parent ad set failed to create",
        })
      );
      continue;
    }

    const adPayloads: SnapAdPayload[] = squadCreatives
      .filter((cr: CreativeFormData) => creativeIdMap.has(cr.id))
      .map((cr: CreativeFormData) => ({
        ad_squad_id: snapSquadId,
        creative_id: creativeIdMap.get(cr.id)!,
        name: cr.name,
        type: "SNAP_AD",
        status: "ACTIVE",
      }));

    if (adPayloads.length === 0) continue;

    const adRes = await fetch("/api/snapchat/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adSquadId: snapSquadId, ads: adPayloads }),
    });
    const adData = await adRes.json() as { results: Array<{ id?: string; error?: string }> };

    squadCreatives.forEach((cr: CreativeFormData, i: number) => {
      const snap = adData.results?.[i];
      results.ads.push({
        clientId: cr.id,
        snapId: snap?.id ?? "",
        name: cr.name,
        error: snap?.error,
      });
    });
  }

  onStage("done");
  return results;
}
