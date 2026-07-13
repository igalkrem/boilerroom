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
  trafficSources: string[]; // which traffic sources may use this domain: "Snap" | "Meta"
}

// URL parameters + base URL. Now lives per traffic source (snapConfig / metaConfig).
export interface UrlConfig {
  baseUrl: string;
  parameters: UrlParameter[];
}

// Channel pool setup. Now lives per traffic source (snapConfig / metaConfig).
export interface ChannelConfig {
  type: ChannelSetupType;
  channelParamKey?: string; // parameter-based: e.g. "asid"
}

export interface FeedProvider {
  id: string;
  name: string;
  // Snap tab
  snapConfig: {
    organizationId?: string; // legacy; resolves {{organization_id}} macro in URL templates
    allowedAdAccountIds: string[];
    allowedPixelIds: string[];
    campaignNamingTemplate?: NamingSegment[]; // Snap-specific naming template; segments joined by " | "
    revenueSource?: "visymo" | "predicto"; // used by cron to route sync windows (:15 vs :46)
    urlConfig?: UrlConfig; // per-source URL parameters
    channelConfig?: ChannelConfig; // per-source channel pool setup
  };
  // Meta / Facebook tab
  metaConfig?: {
    allowedAdAccountIds: string[];
    allowedPixelIds: string[];
    pageId?: string; // legacy single page; kept in sync = first assigned page (allowedPageIds[0])
    allowedPageIds?: string[]; // Facebook Pages assigned to this provider (managed in Traffic Sources)
    campaignNamingTemplate?: NamingSegment[];
    revenueSource?: "predicto_fb"; // Facebook-traffic revenue source (informational — Meta syncs every cron run)
    urlConfig?: UrlConfig; // per-source URL parameters
    channelConfig?: ChannelConfig; // per-source channel pool setup
  };
  // Domains — one shared list, each domain tagged with the traffic sources allowed to use it
  domains: FeedProviderDomain[];
  // DEPRECATED provider-level fields — kept for back-compat reads; upcast() migrates
  // them into snapConfig. Do not write to these going forward.
  urlConfig?: UrlConfig;
  channelConfig?: ChannelConfig;
  createdAt: string;
}

export function emptyFeedProvider(): Omit<FeedProvider, "id" | "createdAt"> {
  return {
    name: "",
    snapConfig: {
      allowedAdAccountIds: [],
      allowedPixelIds: [],
      urlConfig: { baseUrl: "", parameters: [] },
      channelConfig: { type: "parameter-based" },
    },
    metaConfig: {
      allowedAdAccountIds: [],
      allowedPixelIds: [],
      allowedPageIds: [],
      urlConfig: { baseUrl: "", parameters: [] },
      channelConfig: { type: "parameter-based" },
    },
    domains: [],
  };
}
