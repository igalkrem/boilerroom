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
import { buildAdvantagePlusCreativeFeatures } from "@/lib/meta/creative-features";
import { updateMetaUpload } from "@/lib/silo";

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

  // Reuse a pre-uploaded Meta media ref (from a Silo "→ Meta" upload to this exact
  // ad account) instead of re-uploading the same asset fresh at every launch.
  for (const creative of synthesis.creatives) {
    if (creative.metaImageHash) {
      mediaMap.set(creative.id, { type: "IMAGE", imageHash: creative.metaImageHash });
      results.uploadMedia.push({ clientId: creative.id, snapId: "", platformId: creative.metaImageHash, name: creative.name });
    } else if (creative.metaVideoId) {
      mediaMap.set(creative.id, { type: "VIDEO", videoId: creative.metaVideoId });
      results.uploadMedia.push({ clientId: creative.id, snapId: "", platformId: creative.metaVideoId, name: creative.name });
    }
  }

  const uploadQueue = synthesis.creatives.filter(
    (c) => c.siloAssetBlobUrl && !c.metaImageHash && !c.metaVideoId
  );
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
          if (creative.siloAssetId) {
            updateMetaUpload(creative.siloAssetId, adAccountId, { stage: "ready", imageHash: data.imageHash });
          }
        } else {
          mediaMap.set(creative.id, { type: "VIDEO", videoId: data.videoId });
          results.uploadMedia.push({ clientId: creative.id, snapId: "", platformId: data.videoId, name: creative.name });
          if (creative.siloAssetId) {
            updateMetaUpload(creative.siloAssetId, adAccountId, { stage: "ready", videoId: data.videoId });
          }
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
  const metaChannelType = provider?.metaConfig?.channelConfig?.type ?? provider?.channelConfig?.type;
  if (metaChannelType === "provider-supplied") {
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

  // Budget always lives on the ad set (ABO) — Meta rejects a request that sets
  // budget on both campaign and ad set, so the campaign must never include one.
  const campaignPayload: MetaCampaignPayload = {
    name: resolveChannel(synthesis.campaign.name),
    status: synthesis.campaign.status,
    objective: "OUTCOME_SALES",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
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
    attribution_spec: [{ event_type: "CLICK_THROUGH", window_days: 1 }],
    daily_budget: synthesis.adSet.dailyBudgetCents,
    start_time: synthesis.adSet.startDate
      ? new Date(synthesis.adSet.startDate).toISOString()
      : new Date().toISOString(),
    end_time: synthesis.adSet.endDate
      ? new Date(synthesis.adSet.endDate).toISOString()
      : undefined,
  };

  // Omit bid_strategy/bid_amount entirely for LOWEST_COST_WITHOUT_CAP — Meta
  // defaults to it and rejects bid_amount without a matching bid_strategy.
  if (synthesis.adSet.bidStrategy && synthesis.adSet.bidStrategy !== "LOWEST_COST_WITHOUT_CAP") {
    adSetPayload.bid_strategy = synthesis.adSet.bidStrategy;
    if (synthesis.adSet.bidStrategy === "COST_CAP" && synthesis.adSet.bidAmountCents) {
      adSetPayload.bid_amount = synthesis.adSet.bidAmountCents;
    } else if (synthesis.adSet.bidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && synthesis.adSet.roasFloor) {
      // The ROAS floor is NOT bid_amount — it's bid_constraints.roas_average_floor
      // (roasFloor * 10000). Confirmed live 2026-07-15 via GET /api/meta/adsets
      // against the reference "boiler" ad set: a 0.9 ROAS goal is stored as
      // {"roas_average_floor":9000}. Two earlier attempts sent this value
      // through bid_amount instead (at *1000 and *10000 scale) and both failed
      // with "Bid Strategy Doesn't Support Value Optimization" — wrong field,
      // not wrong scale.
      adSetPayload.bid_constraints = { roas_average_floor: Math.round(synthesis.adSet.roasFloor * 10000) };
    }
  }

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

  // Cache page → page-backed Instagram actor id lookups across creatives that
  // share the same Facebook Page.
  const instagramActorIdByPage = new Map<string, string | undefined>();

  // First pass: resolve each media item's URL/thumbnail/Instagram actor, same
  // as before — collected here instead of building a creative/ad immediately,
  // so a 2+ item creative group can be bundled into one ad below.
  interface ResolvedItem {
    creative: MetaSynthesisResult["creatives"][number];
    media: { type: "IMAGE" | "VIDEO"; imageHash?: string; videoId?: string };
    webViewUrl: string;
    videoThumbnailUrl?: string;
    instagramActorId?: string;
  }
  const resolved: ResolvedItem[] = [];

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

    // Meta rejects video creatives with no thumbnail ("Your ad needs a video
    // thumbnail", error_subcode 1443226, confirmed live 2026-07-15) — fetch
    // Meta's auto-generated thumbnail for the uploaded/pre-uploaded video.
    let videoThumbnailUrl: string | undefined;
    if (media.type === "VIDEO") {
      try {
        const res = await fetch(`/api/meta/media?videoId=${encodeURIComponent(media.videoId!)}`);
        const data = await res.json();
        videoThumbnailUrl = data.thumbnailUrl ?? undefined;
      } catch {
        // fall through — creative creation below will surface Meta's own error
      }
    }

    // Ads Manager's "Identity" section needs an Instagram actor set even when
    // no real IG account is connected — Meta uses the page's page-backed
    // Instagram account (the "Use Facebook Page" option). Confirmed live
    // 2026-07-16 via GET /api/meta/ads against a reference ad: its creative
    // carries `instagram_user_id` (read-back name for the write field
    // `instagram_actor_id`) even though no professional IG account is linked.
    let instagramActorId: string | undefined;
    if (instagramActorIdByPage.has(creative.pageId)) {
      instagramActorId = instagramActorIdByPage.get(creative.pageId);
    } else {
      try {
        const res = await fetch(
          `/api/meta/media?pageId=${encodeURIComponent(creative.pageId)}&adAccountId=${encodeURIComponent(adAccountId)}`
        );
        const data = await res.json();
        instagramActorId = data.instagramActorId ?? undefined;
      } catch {
        // fall through — ad will simply have no Instagram identity set
      }
      instagramActorIdByPage.set(creative.pageId, instagramActorId);
    }

    resolved.push({ creative, media, webViewUrl, videoThumbnailUrl, instagramActorId });
  }

  // synthesizeMetaCampaign() suffixes each item in a multi-asset creative
  // group with " [n]" (see synthesize-campaign.ts) — strip it so a bundled
  // group-ad below is named after the group, not its first item.
  const stripIndexSuffix = (name: string) => name.replace(/ \[\d+\]$/, "");

  if (resolved.length > 1) {
    // 2+ media items in this creative group: launch as ONE Flexible ad whose
    // creative_asset_groups_spec bundles every item's asset into a single
    // group, instead of one ad per item — this is the Meta half of the
    // per-platform group behavior (Snap keeps one ad per media item under the
    // same ad squad, unchanged — see submission-orchestrator.ts). Push a
    // single results.creatives/results.ads entry for the whole group so
    // build-log/UI counts reflect the true "1 ad created," not one per item.
    const seed = resolved[0];
    const groupName = resolveChannel(stripIndexSuffix(seed.creative.name));

    const creativePayload: MetaAdCreativePayload = {
      name: groupName,
      ...(seed.instagramActorId ? { instagram_actor_id: seed.instagramActorId } : {}),
      degrees_of_freedom_spec: buildAdvantagePlusCreativeFeatures(seed.media.type),
      object_story_spec: {
        page_id: seed.creative.pageId,
        ...(seed.media.type === "IMAGE"
          ? {
              link_data: {
                link: seed.webViewUrl,
                image_hash: seed.media.imageHash!,
                name: seed.creative.metaHeadline || seed.creative.headline,
                message: seed.creative.metaPrimaryText || seed.creative.headline,
                call_to_action: { type: "LEARN_MORE", value: { link: seed.webViewUrl } },
              },
            }
          : {
              video_data: {
                video_id: seed.media.videoId!,
                ...(seed.videoThumbnailUrl ? { image_url: seed.videoThumbnailUrl } : {}),
                title: seed.creative.metaHeadline || seed.creative.headline,
                message: seed.creative.metaPrimaryText || seed.creative.headline,
                call_to_action: { type: "LEARN_MORE", value: { link: seed.webViewUrl } },
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
      results.creatives.push({ clientId: seed.creative.id, snapId: "", platformId: creativeId, name: groupName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.creatives.push({ clientId: seed.creative.id, snapId: "", name: groupName, error: msg });
      onStage("done");
      return results;
    }

    onStage("ads");

    const images = resolved.filter((r) => r.media.type === "IMAGE").map((r) => ({ hash: r.media.imageHash! }));
    const videos = resolved
      .filter((r) => r.media.type === "VIDEO")
      .map((r) => ({
        video_id: r.media.videoId!,
        ...(r.videoThumbnailUrl ? { thumbnail_url: r.videoThumbnailUrl } : {}),
      }));

    const adPayload: MetaAdPayload = {
      name: groupName,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: seed.creative.adStatus,
      creative_asset_groups_spec: {
        origins: ["CAG"],
        groups: [
          {
            call_to_action: { type: "LEARN_MORE", value: { link: seed.webViewUrl } },
            ...(images.length ? { images } : {}),
            ...(videos.length ? { videos } : {}),
            bodies: [{ text: seed.creative.metaPrimaryText || seed.creative.headline || "" }],
            titles: [{ text: seed.creative.metaHeadline || seed.creative.headline || "" }],
          },
        ],
      },
    };

    try {
      const res = await fetch("/api/meta/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId, ad: adPayload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ad creation failed");
      results.ads.push({ clientId: seed.creative.id, snapId: "", platformId: data.ad.id, name: groupName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.ads.push({ clientId: seed.creative.id, snapId: "", name: groupName, error: msg });
    }
  } else {
    // 0 or 1 media items — unchanged single-creative/single-ad path.
    for (const { creative, media, webViewUrl, videoThumbnailUrl, instagramActorId } of resolved) {
      const creativePayload: MetaAdCreativePayload = {
        name: resolveChannel(creative.name),
        ...(instagramActorId ? { instagram_actor_id: instagramActorId } : {}),
        degrees_of_freedom_spec: buildAdvantagePlusCreativeFeatures(media.type),
        object_story_spec: {
          page_id: creative.pageId,
          ...(media.type === "IMAGE"
            ? {
                link_data: {
                  link: webViewUrl,
                  image_hash: media.imageHash!,
                  name: creative.metaHeadline || creative.headline,
                  message: creative.metaPrimaryText || creative.headline,
                  // Fixed CTA — no per-preset/article configuration.
                  call_to_action: { type: "LEARN_MORE", value: { link: webViewUrl } },
                },
              }
            : {
                video_data: {
                  video_id: media.videoId!,
                  ...(videoThumbnailUrl ? { image_url: videoThumbnailUrl } : {}),
                  title: creative.metaHeadline || creative.headline,
                  message: creative.metaPrimaryText || creative.headline,
                  call_to_action: { type: "LEARN_MORE", value: { link: webViewUrl } },
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

      // "Format: Flexible" is driven by this ad-level field, not by anything on
      // the creative — confirmed live 2026-07-20 by capturing Ads Manager's own
      // Relay preloader payload for a known "Flexible" ad and reproducing it via
      // a throwaway test ad. Reuses the same single image/video already used for
      // this ad's object_story_spec above (one group is enough to trigger the
      // label — Meta doesn't require multiple assets in the group).
      const adPayload: MetaAdPayload = {
        name: resolveChannel(creative.name),
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: creative.adStatus,
        creative_asset_groups_spec: {
          origins: ["CAG"],
          groups: [
            {
              call_to_action: { type: "LEARN_MORE", value: { link: webViewUrl } },
              ...(media.type === "IMAGE"
                ? { images: [{ hash: media.imageHash! }] }
                : {
                    videos: [
                      {
                        video_id: media.videoId!,
                        ...(videoThumbnailUrl ? { thumbnail_url: videoThumbnailUrl } : {}),
                      },
                    ],
                  }),
              bodies: [{ text: creative.metaPrimaryText || creative.headline || "" }],
              titles: [{ text: creative.metaHeadline || creative.headline || "" }],
            },
          ],
        },
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
  }

  onStage("done");
  return results;
}
