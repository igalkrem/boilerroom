export interface Article {
  id: string;
  feedProviderId: string;
  slug: string; // "Keyword" in UI — resolves {{article.name}}
  query: string;
  status: "active" | "paused"; // defaults to "active" for old records via upcast()
  title?: string;
  previewUrl?: string;
  domain?: string;
  locale?: string; // e.g. "en_US"
  allowedHeadlines: { text: string; rac: string; metaHeadline: string; metaPrimaryText: string }[];
  // first entry is always the default; auto-selected in wizard
  trafficSources: string[]; // which traffic sources this article may be used with: "Snap" | "Meta"
                            // (mirrors FeedProviderDomain.trafficSources); defaults to both via upcast()
  createdAt: string;
}
