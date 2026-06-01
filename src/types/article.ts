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
  allowedHeadlines: { text: string; rac: string }[];
  defaultHeadlineIndex?: number; // index into allowedHeadlines; auto-selected in wizard
  createdAt: string;
}
