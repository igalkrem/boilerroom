import { v4 as uuid } from "uuid";
import type { CampaignBuildItem } from "@/types/wizard";
import type { CampaignFormData, AdSquadFormData, CreativeFormData } from "@/types/wizard";
import type { FeedProvider } from "@/types/feed-provider";
import type { Article } from "@/types/article";
import type { CampaignPreset } from "@/types/preset";
import type { SiloAsset } from "@/types/silo";
import type { MetaBillingEvent, MetaOptimizationGoal, MetaPixelEvent, MetaBidStrategy } from "@/types/meta";
import { DEFAULT_PAGE_AD_LIMIT } from "@/types/page-config";
import { getMetaMediaRef } from "@/lib/silo";
import { getCountryGroupById } from "@/lib/country-groups";

// When a preset is linked to a Country Group, resolve the group's CURRENT
// members at build time instead of the preset's last-saved snapshot — this is
// what makes the link live: editing a group changes every future campaign
// built from a linked preset, without needing to re-save the preset itself.
function resolveGeoCountryCodes(preset: CampaignPreset, fallback: string[]): string[] {
  if (!preset.countryGroupId) return fallback;
  const group = getCountryGroupById(preset.countryGroupId);
  return group?.countryCodes ?? fallback; // group deleted/missing → fall back to last-saved snapshot
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function ensureFutureDate(date: string): string {
  return date < todayIso() ? todayIso() : date;
}

export interface SynthesisResult {
  campaigns: CampaignFormData[];
  adSquads: AdSquadFormData[];
  creatives: CreativeFormData[];
  feedProviderId: string;
  articleQuery: string;
  articleSlug: string;
  headline: string;
}

export function synthesizeCampaign(
  item: CampaignBuildItem,
  campaignName: string,
  provider: FeedProvider,
  article: Article,
  preset: CampaignPreset,
  assets: SiloAsset[]
): SynthesisResult {
  const campaignId = uuid();
  const adSquadId = uuid();

  // Use first ad squad template from preset
  const squadTemplate = preset.adSquads[0];
  if (!squadTemplate) {
    throw new Error(`Preset "${preset.name}" has no ad squad template`);
  }

  // Catalogue (Dynamic Collection Ads) require a Catalog ID + Product Set ID.
  const isCatalogue = preset.isCatalogue === true;
  if (isCatalogue) {
    if (!squadTemplate.productSetId) {
      throw new Error(`Catalogue preset "${preset.name}" is missing a Product Set ID`);
    }
    if (!squadTemplate.catalogId) {
      throw new Error(`Catalogue preset "${preset.name}" is missing a Catalog ID`);
    }
  }

  const campaign: CampaignFormData = {
    id: campaignId,
    name: campaignName,
    objective: preset.campaign.objective,
    status: preset.campaign.status,
    startDate: preset.campaign.startDate ? ensureFutureDate(preset.campaign.startDate) : todayIso(),
    endDate: preset.campaign.endDate ? ensureFutureDate(preset.campaign.endDate) : undefined,
    spendCapType: preset.campaign.spendCapType,
    dailyBudgetUsd: preset.campaign.dailyBudgetUsd,
    lifetimeBudgetUsd: preset.campaign.lifetimeBudgetUsd,
    // Catalogue (Dynamic Collection Ads): campaign must declare the catalog.
    // Confirmed from a live working DPA campaign — catalog_id lives on the campaign;
    // product_set_id lives on the squad + creative.
    catalogId: isCatalogue ? squadTemplate.catalogId : undefined,
  };
  const adSquad: AdSquadFormData = {
    id: adSquadId,
    campaignId,
    name: campaignName,
    type: squadTemplate.type,
    geoCountryCodes: resolveGeoCountryCodes(
      preset,
      (squadTemplate as { geoCountryCodes?: string[]; geoCountryCode?: string }).geoCountryCodes
        ?? [(squadTemplate as { geoCountryCodes?: string[]; geoCountryCode?: string }).geoCountryCode ?? "US"]
    ),
    optimizationGoal: squadTemplate.optimizationGoal,
    bidStrategy: squadTemplate.bidStrategy,
    bidAmountUsd: squadTemplate.bidAmountUsd,
    spendCapType: squadTemplate.spendCapType,
    dailyBudgetUsd: squadTemplate.dailyBudgetUsd,
    lifetimeBudgetUsd: squadTemplate.lifetimeBudgetUsd,
    status: squadTemplate.status,
    startDate: squadTemplate.startDate ? ensureFutureDate(squadTemplate.startDate) : undefined,
    endDate: squadTemplate.endDate ? ensureFutureDate(squadTemplate.endDate) : undefined,
    smartPlacement: squadTemplate.smartPlacement,
    targetingGender: squadTemplate.targetingGender,
    targetingDeviceType: squadTemplate.targetingDeviceType,
    targetingOsType: squadTemplate.targetingOsType,
    minAge: squadTemplate.minAge,
    maxAge: squadTemplate.maxAge,
    pixelId: squadTemplate.pixelId || undefined,
    productSetId: squadTemplate.productSetId || undefined,
  };

  // Catalogue (Dynamic Collection Ads) use a hero Silo asset AND a tracking URL, exactly like a
  // regular ad — they just carry extra catalogue fields (product set + template) that the
  // orchestrator turns into a COLLECTION creative with an auto-built interaction zone.
  // The webViewUrl is resolved by the orchestrator after channel assignment + snap ID resolution.
  const urlTemplatePlaceholder = buildUrlTemplate(provider, article, item.headline, item.headlineRac, item.adAccountId);
  if (!urlTemplatePlaceholder) {
    throw new Error(
      `Provider "${provider.name}" has no base URL and no parameters — configure a base URL on the domain or provider.`
    );
  }

  const multiAsset = assets.length > 1;
  const creatives: CreativeFormData[] = assets.map((asset, idx) => ({
    id: uuid(),
    adSquadId,
    name: multiAsset ? `${campaignName} [${idx + 1}]` : campaignName,
    headline: item.headline,
    brandName: preset.creativeDefaults?.brandName,
    interactionType: "WEB_VIEW" as const,
    webViewUrl: urlTemplatePlaceholder,
    articleId: article.id,
    adStatus: preset.creativeDefaults?.adStatus ?? "PAUSED",
    uploadStatus: "idle" as const,
    siloAssetId: asset.id,
    siloAssetBlobUrl: asset.optimizedUrl ?? asset.originalUrl,
    siloAssetMediaType: asset.mediaType,
    siloAssetOriginalFileName: asset.originalFileName,
    ...(isCatalogue
      ? {
          isCatalogue: true,
          productSetId: squadTemplate.productSetId,
          dynamicTemplateId: squadTemplate.dynamicTemplateId,
        }
      : {}),
  }));

  return {
    campaigns: [campaign],
    adSquads: [adSquad],
    creatives,
    feedProviderId: provider.id,
    articleQuery: article.query,
    articleSlug: article.slug,
    headline: item.headline,
  };
}

function buildUrlTemplate(
  provider: FeedProvider,
  article: Article,
  headline: string,
  rac: string,
  adAccountId: string,
  trafficSource: "Snap" | "Meta" = "Snap"
): string {
  // Build the URL with macros still in place for dynamic ones (campaign.id, adSet.id, ad.id)
  // Static ones (article.name, article.query, creative.headline, creative.rac) are substituted now.
  // Per-source config: use the launching platform's urlConfig (fallback to legacy top-level),
  // and match the article's domain only among domains tagged for this traffic source.
  const platformConfig = trafficSource === "Meta" ? provider.metaConfig : provider.snapConfig;
  const urlConfig = platformConfig?.urlConfig ?? provider.urlConfig ?? { baseUrl: "", parameters: [] };
  const domain = provider.domains.find(
    (d) => d.baseDomain === article.domain && (d.trafficSources ?? ["Snap"]).includes(trafficSource)
  );
  const base = (domain?.baseUrl ?? urlConfig.baseUrl ?? "").replace(/\/$/, "");
  const params = urlConfig.parameters
    .map((p) => {
      let resolved = p.value
        .replace(/\{\{article\.name\}\}/gi, encodeURIComponent(article.slug))
        .replace(/\{\{article\.query\}\}/gi, encodeURIComponent(article.query))
        .replace(/\{\{creative\.headline\}\}/gi, encodeURIComponent(headline))
        .replace(/\{\{creative\.rac\}\}/gi, encodeURIComponent(rac))
        .replace(/\{\{organization_id\}\}/gi, encodeURIComponent(provider.snapConfig.organizationId ?? ""))
        .replace(/\{\{ad_account\.id\}\}/gi, encodeURIComponent(adAccountId))
        // Strip any remaining {{...}} that aren't Snapchat native or orchestrator macros
        .replace(/\{\{(?!campaign\.id|adset\.id|ad\.id|channel\.id)[^}]+\}\}/gi, "");
      if (p.encode) {
        // Split on {{channel.id}} so it survives encoding — the orchestrator resolves it
        // after synthesis, and encodeURIComponent would turn it into %7B%7Bchannel.id%7D%7D
        // which the orchestrator's regex would never match.
        const parts = resolved.split(/\{\{channel\.id\}\}/gi);
        resolved = parts.map((part) => encodeURIComponent(part)).join("{{channel.id}}");
      }
      return `${p.key}=${resolved}`;
    })
    .join("&");
  if (!params) return base;
  if (!base) return ""; // don't produce "?key=value" with no host — callers treat "" as missing URL
  return `${base}?${params}`;
}

// ─── Meta synthesis ─────────────────────────────────────────────────────────

export interface MetaSynthesisResult {
  campaign: {
    name: string;
    status: "ACTIVE" | "PAUSED";
  };
  adSet: {
    name: string;
    status: "ACTIVE" | "PAUSED";
    geoCountryCodes: string[];
    billingEvent: MetaBillingEvent;
    optimizationGoal: MetaOptimizationGoal;
    bidStrategy?: MetaBidStrategy;
    bidAmountCents?: number;
    roasFloor?: number;
    dailyBudgetCents: number;
    pixelId?: string;
    pixelEvent?: MetaPixelEvent;
    targetingGender?: "ALL" | "MALE" | "FEMALE";
    minAge?: number;
    maxAge?: number;
    publisherPlatforms?: ("facebook" | "instagram" | "audience_network")[];
    startDate?: string;
    endDate?: string;
  };
  creatives: Array<{
    id: string;
    name: string;
    pageId: string;
    webViewUrl: string;
    headline?: string;
    adStatus: "ACTIVE" | "PAUSED";
    siloAssetBlobUrl?: string;
    siloAssetMediaType?: "VIDEO" | "IMAGE";
    siloAssetOriginalFileName?: string;
    siloAssetId?: string;
    metaImageHash?: string;
    metaVideoId?: string;
  }>;
  feedProviderId: string;
  articleQuery: string;
  articleSlug: string;
  headline: string;
}

/**
 * Among a provider's assigned Facebook Pages, pick the one with the most ads
 * remaining (ad limit − running/in-review count). Ties resolve to the earliest
 * page in `allowedPageIds`. Returns undefined when no pages are assigned.
 */
export function pickBestPage(
  allowedPageIds: string[] | undefined,
  runningByPage: Record<string, number>
): string | undefined {
  if (!allowedPageIds || allowedPageIds.length === 0) return undefined;
  // Every page has the same fixed 250 ad limit, so "most remaining" is simply
  // "fewest running ads". Ties resolve to the first-listed page.
  let best: string | undefined;
  let bestRemaining = -Infinity;
  for (const pid of allowedPageIds) {
    const running = runningByPage[pid] ?? 0;
    const remaining = DEFAULT_PAGE_AD_LIMIT - running;
    if (remaining > bestRemaining) {
      bestRemaining = remaining;
      best = pid;
    }
  }
  return best;
}

export function synthesizeMetaCampaign(
  item: CampaignBuildItem,
  campaignName: string,
  provider: FeedProvider,
  article: Article,
  preset: CampaignPreset,
  assets: SiloAsset[],
  resolvedPageId?: string
): MetaSynthesisResult {
  const metaAdSet = preset.metaAdSet;
  if (!metaAdSet) {
    throw new Error(`Preset "${preset.name}" has no Meta ad set configuration`);
  }

  // Prefer the page resolved at launch (most ads remaining among assigned pages);
  // fall back to the provider's stored page for backward compatibility.
  const pageId =
    resolvedPageId ?? provider.metaConfig?.pageId ?? provider.metaConfig?.allowedPageIds?.[0];
  if (!pageId) {
    throw new Error(`Provider "${provider.name}" has no Facebook Page assigned`);
  }

  const urlTemplate = buildUrlTemplate(provider, article, item.headline, item.headlineRac, item.adAccountId, "Meta");
  if (!urlTemplate) {
    throw new Error(
      `Provider "${provider.name}" has no base URL and no parameters — configure a base URL on the domain or provider.`
    );
  }

  const multiAsset = assets.length > 1;

  return {
    campaign: {
      name: campaignName,
      status: preset.campaign.status,
    },
    adSet: {
      name: campaignName,
      status: metaAdSet.status,
      geoCountryCodes: resolveGeoCountryCodes(preset, metaAdSet.geoCountryCodes),
      billingEvent: metaAdSet.billingEvent,
      optimizationGoal: metaAdSet.optimizationGoal,
      bidStrategy: metaAdSet.bidStrategy,
      bidAmountCents: metaAdSet.bidAmountCents,
      roasFloor: metaAdSet.roasFloor,
      dailyBudgetCents: metaAdSet.dailyBudgetCents,
      pixelId: metaAdSet.pixelId,
      pixelEvent: metaAdSet.pixelEvent,
      targetingGender: metaAdSet.targetingGender,
      minAge: metaAdSet.minAge,
      maxAge: metaAdSet.maxAge,
      publisherPlatforms: metaAdSet.publisherPlatforms,
      startDate: metaAdSet.startDate ? ensureFutureDate(metaAdSet.startDate) : undefined,
      endDate: metaAdSet.endDate ? ensureFutureDate(metaAdSet.endDate) : undefined,
    },
    creatives: assets.map((asset, idx) => {
      // Reuse a pre-uploaded Meta media ref (Silo "→ Meta" upload) for this exact
      // ad account when available, so the orchestrator can skip re-uploading.
      const cached = getMetaMediaRef(asset, item.adAccountId);
      return {
        id: uuid(),
        name: multiAsset ? `${campaignName} [${idx + 1}]` : campaignName,
        pageId,
        webViewUrl: urlTemplate,
        headline: item.headline,
        adStatus: preset.creativeDefaults?.adStatus ?? "PAUSED",
        siloAssetBlobUrl: asset.optimizedUrl ?? asset.originalUrl,
        siloAssetMediaType: asset.mediaType,
        siloAssetOriginalFileName: asset.originalFileName,
        siloAssetId: asset.id,
        metaImageHash: cached?.imageHash,
        metaVideoId: cached?.videoId,
      };
    }),
    feedProviderId: provider.id,
    articleQuery: article.query,
    articleSlug: article.slug,
    headline: item.headline,
  };
}
