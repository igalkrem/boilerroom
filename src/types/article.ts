export interface FeedProvider {
  id: string;
  name: string;
  parameterName: string; // URL param key, e.g. "article"
  baseUrl: string;       // e.g. "https://example.com/lp"
  createdAt: string;
}

export interface Article {
  id: string;
  feedProviderId: string;
  slug: string;              // URL param value, e.g. "best-cars-2026"
  allowedHeadlines: string[]; // each ≤ 34 chars (Snapchat limit)
  createdAt: string;
}

export function buildArticleUrl(provider: FeedProvider, article: Article): string {
  const base = provider.baseUrl.replace(/\/$/, "");
  return `${base}?${provider.parameterName}=${article.slug}`;
}
