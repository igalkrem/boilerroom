export interface Article {
  id: string;
  feedProviderId: string;
  slug: string;
  query: string; // keyword passed as search= / q= in URL (e.g. "sme phone package 2026")
  allowedHeadlines: string[]; // each ≤ 34 chars (Snapchat limit)
  createdAt: string;
}
