import type { SubmissionResults } from "@/types/wizard";
import type { FeedProvider } from "@/types/feed-provider";
import type { MetaSynthesisResult } from "@/lib/synthesize-campaign";
import type {
  MetaCampaignPayload,
  MetaAdSetPayload,
  MetaTargeting,
  MetaAdCreativePayload,
  MetaAdPayload,
} from "@/types/meta";

type OnStageChange = (stage: string) => void;

const UPLOAD_CONCURRENCY = 2;

export async function runMetaSubmission(
  adAccountId: string,
  synthesis: MetaSynthesisResult,
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

  // ── Stage 1: Upload media ────────────────────────────────────────────────
  onStage("uploadMedia");

  const mediaMap = new Map<string, { type: "IMAGE" | "VIDEO"; imageHash?: string; videoId?: string }>();

  const uploadQueue = synthesis.creatives.filter((c) => c.siloAssetBlobUrl);
  const runQueue = [...uploadQueue];

  async function uploadWorker() {
    while (runQueue.length > 0) {
      const creative = runQueue.shift()!;
      try {
        const res = await fetch("/api/meta/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adAccountId,
            type: creative.siloAssetMediaType ?? "IMAGE",
            blobUrl: creative.siloAssetBlobUrl,
            fileName: creative.siloAssetOriginalFileName ?? "media",
            title: creative.name,
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err);
        }
        const data = await res.json();
        if (data.type === "IMAGE") {
          mediaMap.set(creative.id, { type: "IMAGE", imageHash: data.imageHash });
          results.uploadMedia.push({ clientId: creative.id, snapId: "", platformId: data.imageHash, name: creative.name });
        } else {
          mediaMap.set(creative.id, { type: "VIDEO", videoId: data.videoId });
          results.uploadMedia.push({ clientId: creative.id, snapId: "", platformId: data.videoId, name: creative.name });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.uploadMedia.push({ clientId: creative.id, snapId: "", name: creative.name, error: msg });
      }
    }
  }

  const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, uploadQueue.length) }, () => uploadWorker());
  await Promise.all(workers);

  // ── Stage 2: Channel assignment ──────────────────────────────────────────
  let channelId = "";
  if (provider?.channelConfig.type === "provider-supplied") {
    try {
      const res = await fetch("/api/feed-providers/channels/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedProviderId: synthesis.feedProviderId,
          campaignSnapId: "",
          adAccountId,
          trafficSource: "Meta",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        channelId = data.channelId ?? "";
      }
    } catch {
      // Channel assignment is best-effort
    }
  }

  // Resolve {{channel.id}} in campaign/creative names
  const resolveChannel = (s: string) => s.replace(/\{\{channel\.id\}\}/gi, channelId);

  // ── Stage 3: Create campaign ─────────────────────────────────────────────
  onStage("campaigns");

  const campaignPayload: MetaCampaignPayload = {
    name: resolveChannel(synthesis.campaign.name),
    status: synthesis.campaign.status,
    objective: "OUTCOME_SALES",
    special_ad_categories: [],
    daily_budget: synthesis.campaign.dailyBudgetCents,
  };

  let campaignId = "";
  try {
    const res = await fetch("/api/meta/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adAccountId, campaign: campaignPayload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "campaign creation failed");
    campaignId = data.campaign.id;
    results.campaigns.push({ clientId: "c-0", snapId: "", platformId: campaignId, name: campaignPayload.name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.campaigns.push({ clientId: "c-0", snapId: "", name: campaignPayload.name, error: msg });
    return results;
  }

  // ── Stage 4: Create ad set ───────────────────────────────────────────────
  onStage("adSquads");

  const targeting: MetaTargeting = {
    geo_locations: { countries: synthesis.adSet.geoCountryCodes },
  };
  if (synthesis.adSet.minAge) targeting.age_min = synthesis.adSet.minAge;
  if (synthesis.adSet.maxAge) targeting.age_max = synthesis.adSet.maxAge;
  if (synthesis.adSet.targetingGender && synthesis.adSet.targetingGender !== "ALL") {
    targeting.genders = synthesis.adSet.targetingGender === "MALE" ? [1] : [2];
  }
  if (synthesis.adSet.publisherPlatforms?.length) {
    targeting.publisher_platforms = synthesis.adSet.publisherPlatforms;
  }

  const adSetPayload: MetaAdSetPayload = {
    campaign_id: campaignId,
    name: resolveChannel(synthesis.adSet.name),
    status: synthesis.adSet.status,
    targeting,
    billing_event: synthesis.adSet.billingEvent,
    optimization_goal: synthesis.adSet.optimizationGoal,
    bid_amount: synthesis.adSet.bidAmountCents,
    daily_budget: synthesis.adSet.dailyBudgetCents,
    start_time: synthesis.adSet.startDate
      ? new Date(synthesis.adSet.startDate).toISOString()
      : new Date().toISOString(),
    end_time: synthesis.adSet.endDate
      ? new Date(synthesis.adSet.endDate).toISOString()
      : undefined,
  };

  if (synthesis.adSet.pixelId && synthesis.adSet.pixelEvent) {
    adSetPayload.promoted_object = {
      pixel_id: synthesis.adSet.pixelId,
      custom_event_type: synthesis.adSet.pixelEvent,
    };
  }

  let adSetId = "";
  try {
    const res = await fetch("/api/meta/adsets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adAccountId, adSet: adSetPayload }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "ad set creation failed");
    adSetId = data.adSet.id;
    results.adSquads.push({ clientId: "as-0", snapId: "", platformId: adSetId, name: adSetPayload.name });

    // Link channel to ad set (fire-and-forget)
    if (channelId) {
      fetch("/api/feed-providers/channels/link-squad", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          adSquadId: adSetId,
          campaignSnapId: campaignId,
        }),
      }).catch(() => {});
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.adSquads.push({ clientId: "as-0", snapId: "", name: adSetPayload.name, error: msg });
    return results;
  }

  // ── Stage 5: Create creatives + ads ──────────────────────────────────────
  onStage("creatives");

  for (const creative of synthesis.creatives) {
    const media = mediaMap.get(creative.id);
    if (!media) {
      results.creatives.push({ clientId: creative.id, snapId: "", name: creative.name, error: "No media uploaded" });
      continue;
    }

    // Resolve {{channel.id}} and platform macros in URL
    let webViewUrl = resolveChannel(creative.webViewUrl);
    // {{campaign.id}} / {{adset.id}} are resolved after entity creation
    webViewUrl = webViewUrl
      .replace(/\{\{campaign\.id\}\}/gi, campaignId)
      .replace(/\{\{adset\.id\}\}/gi, adSetId);

    const creativePayload: MetaAdCreativePayload = {
      name: resolveChannel(creative.name),
      object_story_spec: {
        page_id: creative.pageId,
        ...(media.type === "IMAGE"
          ? {
              link_data: {
                link: webViewUrl,
                image_hash: media.imageHash!,
                name: creative.headline,
                message: creative.headline,
                ...(creative.callToAction
                  ? { call_to_action: { type: creative.callToAction, value: { link: webViewUrl } } }
                  : {}),
              },
            }
          : {
              video_data: {
                video_id: media.videoId!,
                image_hash: "",
                title: creative.headline,
                message: creative.headline,
                ...(creative.callToAction
                  ? { call_to_action: { type: creative.callToAction, value: { link: webViewUrl } } }
                  : {}),
              },
            }),
      },
    };

    let creativeId = "";
    try {
      const res = await fetch("/api/meta/creatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId, creative: creativePayload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "creative creation failed");
      creativeId = data.creative.id;
      results.creatives.push({ clientId: creative.id, snapId: "", platformId: creativeId, name: creative.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.creatives.push({ clientId: creative.id, snapId: "", name: creative.name, error: msg });
      continue;
    }

    // Resolve {{ad.id}} placeholder — will be the ad entity ID after creation
    // For Meta, ad.id can't be known before creation, so we leave it if present
    onStage("ads");

    const adPayload: MetaAdPayload = {
      name: resolveChannel(creative.name),
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: creative.adStatus,
    };

    try {
      const res = await fetch("/api/meta/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId, ad: adPayload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ad creation failed");
      results.ads.push({ clientId: creative.id, snapId: "", platformId: data.ad.id, name: creative.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.ads.push({ clientId: creative.id, snapId: "", name: creative.name, error: msg });
    }
  }

  onStage("done");
  return results;
}
