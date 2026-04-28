import { z } from "zod";
import type { Article } from "@/types/article";
import { syncToKV } from "@/lib/kv-sync";

const STORAGE_KEY = "boilerroom_articles_v1";
const KV_KEY = "br_articles";

const articleSchema = z.object({
  id: z.string().min(1),
  feedProviderId: z.string().min(1),
  slug: z.string().min(1),
  allowedHeadlines: z.array(z.string()),
  createdAt: z.string(),
});

export function loadArticles(): Article[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    return parsed.filter((item) => articleSchema.safeParse(item).success) as Article[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

function saveArticles(articles: Article[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
  syncToKV(KV_KEY, articles);
}

export function upsertArticle(article: Article): void {
  const articles = loadArticles();
  const idx = articles.findIndex((a) => a.id === article.id);
  if (idx >= 0) {
    articles[idx] = article;
  } else {
    articles.push(article);
  }
  saveArticles(articles);
}

export function deleteArticle(id: string): void {
  const articles = loadArticles().filter((a) => a.id !== id);
  saveArticles(articles);
}

export function getArticleById(id: string): Article | undefined {
  return loadArticles().find((a) => a.id === id);
}
