export type ChannelSetupType = "provider-supplied" | "parameter-based";

export interface NamingSegment {
  type: "literal" | "macro";
  value: string; // literal: plain text; macro: key e.g. "preset.tag"
}

export interface UrlParameter {
  key: string;
  value: string; // may contain macros: {{campaign.id}} {{adSet.id}} {{ad.id}} {{organization_id}} {{channel.id}} {{article.name}} {{article.query}} {{creative.headline}}
  encode?: boolean; // if true, encodeURIComponent is applied to the fully resolved value
}

export interface FeedProviderDomain {
  id: string;
  baseDomain: string;
  baseUrl?: string; // per-domain base URL for URL template building
  trafficSources: string[]; // e.g. ["Snap"]
}

export interface FeedProviderCombo {
  id: string;
  name: string;
  pixelId?: string;
  adAccountIds?: string[];
  urlConfig?: { baseUrl: string; parameters: UrlParameter[] };
  domainId?: string;
}

export interface FeedProvider {
  id: string;
  name: string;
  // Snap tab
  snapConfig: {
    organizationId?: string; // resolves {{organization_id}} macro in URL templates
    allowedAdAccountIds: string[];
    allowedPixelIds: string[];
    campaignNamingTemplate?: NamingSegment[]; // Snap-specific naming template; segments joined by " | "
  };
  // Meta tab
  metaConfig: {
    allowedAdAccountIds: string[];
  };
  // URL Parameters tab
  urlConfig: {
    baseUrl: string;
    parameters: UrlParameter[];
  };
  // Channels tab
  channelConfig: {
    type: ChannelSetupType;
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
    metaConfig: { allowedAdAccountIds: [] },
    urlConfig: { baseUrl: "", parameters: [] },
    channelConfig: { type: "parameter-based" },
    domains: [],
    combos: [],
  };
}
