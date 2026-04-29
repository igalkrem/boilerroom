import { v4 as uuid } from "uuid";
import type { CampaignBuildItem } from "@/types/wizard";
import type { CampaignFormData, AdSquadFormData, CreativeFormData } from "@/types/wizard";
import type { FeedProvider } from "@/types/feed-provider";
import type { Article } from "@/types/article";
import type { CampaignPreset } from "@/types/preset";
import type { SiloAsset } from "@/types/silo";

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
  asset: SiloAsset
): SynthesisResult {
  const campaignId = uuid();
  const adSquadId = uuid();
  const creativeId = uuid();

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
  };

  // Use first ad squad template from preset
  const squadTemplate = preset.adSquads[0];
  const adSquad: AdSquadFormData = {
    id: adSquadId,
    campaignId,
    name: campaignName,
    type: squadTemplate.type,
    geoCountryCodes: (squadTemplate as { geoCountryCodes?: string[]; geoCountryCode?: string }).geoCountryCodes
      ?? [(squadTemplate as { geoCountryCodes?: string[]; geoCountryCode?: string }).geoCountryCode ?? "US"],
    optimizationGoal: squadTemplate.optimizationGoal,
    bidStrategy: squadTemplate.bidStrategy,
    bidAmountUsd: squadTemplate.bidAmountUsd,
    spendCapType: squadTemplate.spendCapType,
    dailyBudgetUsd: squadTemplate.dailyBudgetUsd,
    lifetimeBudgetUsd: squadTemplate.lifetimeBudgetUsd,
    status: squadTemplate.status,
    startDate: squadTemplate.startDate ? ensureFutureDate(squadTemplate.startDate) : undefined,
    endDate: squadTemplate.endDate ? ensureFutureDate(squadTemplate.endDate) : undefined,
    placementConfig: squadTemplate.placementConfig,
    targetingGender: squadTemplate.targetingGender,
    targetingDeviceType: squadTemplate.targetingDeviceType,
    targetingOsType: squadTemplate.targetingOsType,
    pixelId: squadTemplate.pixelId || undefined,
  };

  // The webViewUrl will be resolved by the orchestrator after channel assignment + snap ID resolution.
  // We store the raw URL template here so the orchestrator can resolve it.
  // For now, pass a placeholder that will be replaced.
  const urlTemplatePlaceholder = buildUrlTemplate(provider, article, item.headline, item.headlineRac);

  const creative: CreativeFormData = {
    id: creativeId,
    adSquadId,
    name: campaignName,
    headline: item.headline,
    brandName: preset.creativeDefaults?.brandName,
    callToAction: item.callToAction || preset.creativeDefaults?.callToAction,
    interactionType: "WEB_VIEW",
    webViewUrl: urlTemplatePlaceholder,
    articleId: article.id,
    adStatus: preset.creativeDefaults?.adStatus ?? "PAUSED",
    uploadStatus: "idle",
    // Silo asset
    siloAssetId: asset.id,
    siloAssetBlobUrl: asset.optimizedUrl ?? asset.originalUrl,
    siloAssetMediaType: asset.mediaType,
    siloAssetOriginalFileName: asset.originalFileName,
  };

  return {
    campaigns: [campaign],
    adSquads: [adSquad],
    creatives: [creative],
    feedProviderId: provider.id,
    articleQuery: article.query,
    articleSlug: article.slug,
    headline: item.headline,
  };
}

function buildUrlTemplate(provider: FeedProvider, article: Article, headline: string, rac: string): string {
  // Build the URL with macros still in place for dynamic ones (campaign.id, adSet.id, ad.id)
  // Static ones (article.name, article.query, creative.headline, creative.rac) are substituted now.
  const base = provider.urlConfig.baseUrl.replace(/\/$/, "");
  const params = provider.urlConfig.parameters
    .map((p) => {
      const resolved = p.value
        .replace(/\{\{article\.name\}\}/gi, article.slug)
        .replace(/\{\{article\.query\}\}/gi, article.query)
        .replace(/\{\{creative\.headline\}\}/gi, headline)
        .replace(/\{\{creative\.rac\}\}/gi, rac)
        .replace(/\{\{organization_id\}\}/gi, provider.snapConfig.organizationId ?? "");
      return `${p.key}=${resolved}`;
    })
    .join("&");
  return params ? `${base}?${params}` : base;
}
