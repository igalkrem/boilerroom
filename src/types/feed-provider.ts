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

export interface FeedProvider {
  id: string;
  name: string;
  // Snap tab
  snapConfig: {
    organizationId?: string; // resolves {{organization_id}} macro in URL templates
    allowedAdAccountIds: string[];
    allowedPixelIds: string[];
    campaignNamingTemplate?: NamingSegment[]; // Snap-specific naming template; segments joined by " | "
    revenueSource?: "kingsroad" | "predicto"; // used by cron to route sync windows (:15 vs :46)
  };
  // Meta tab
  metaConfig?: {
    allowedAdAccountIds: string[];
    allowedPixelIds: string[];
    pageId?: string; // legacy single page; kept in sync = first assigned page (allowedPageIds[0])
    allowedPageIds?: string[]; // Facebook Pages assigned to this provider (managed in Traffic Sources)
    campaignNamingTemplate?: NamingSegment[];
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
  createdAt: string;
}

export function emptyFeedProvider(): Omit<FeedProvider, "id" | "createdAt"> {
  return {
    name: "",
    snapConfig: { allowedAdAccountIds: [], allowedPixelIds: [] },
    metaConfig: { allowedAdAccountIds: [], allowedPixelIds: [], allowedPageIds: [] },
    urlConfig: { baseUrl: "", parameters: [] },
    channelConfig: { type: "parameter-based" },
    domains: [],
  };
}
