export type ChannelSetupType = "provider-supplied" | "parameter-based";

export interface UrlParameter {
  key: string;
  value: string; // may contain macros: {{campaign.id}} {{adSet.id}} {{ad.id}} {{organization_id}} {{channel.id}} {{article.name}} {{article.query}} {{creative.headline}}
}

export interface FeedProviderDomain {
  id: string;
  baseDomain: string;
  trafficSources: string[]; // e.g. ["Snap"]
}

export interface FeedProviderCombo {
  id: string;
  name: string;
  pixelId?: string;
  adAccountIds?: string[];
  urlConfig?: { baseUrl: string; parameters: UrlParameter[] };
  domainId?: string;
  channelConfig?: { addChannelIdToCampaignName: boolean };
}

export interface FeedProvider {
  id: string;
  name: string;
  // Snap tab
  snapConfig: {
    organizationId?: string; // Snapchat org ID (parent of all ad accounts) — resolves {{organization_id}} macro
    allowedAdAccountIds: string[];
    allowedPixelIds: string[];
  };
  // URL Parameters tab
  urlConfig: {
    baseUrl: string;
    parameters: UrlParameter[];
  };
  // Channels tab
  channelConfig: {
    type: ChannelSetupType;
    addChannelIdToCampaignName?: boolean; // provider-supplied only
    channelParamKey?: string; // parameter-based: e.g. "asid"
  };
  // Domains tab
  domains: FeedProviderDomain[];
  // Combos tab
  combos: FeedProviderCombo[];
  createdAt: string;
}

export function emptyFeedProvider(): Omit<FeedProvider, "id" | "createdAt"> {
  return {
    name: "",
    snapConfig: { allowedAdAccountIds: [], allowedPixelIds: [] },
    urlConfig: { baseUrl: "", parameters: [] },
    channelConfig: { type: "parameter-based" },
    domains: [],
    combos: [],
  };
}
