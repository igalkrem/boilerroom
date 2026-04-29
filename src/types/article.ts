export interface Article {
  id: string;
  feedProviderId: string;
  slug: string; // "Keyword" in UI — resolves {{article.slug}}
  query: string;
  title?: string;
  previewUrl?: string;
  domain?: string;
  locale?: string; // e.g. "en_US"
  allowedHeadlines: { text: string; rac: string }[];
  createdAt: string;
}
