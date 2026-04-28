"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { loadArticles, deleteArticle } from "@/lib/articles";
import { loadFeedProviders } from "@/lib/feed-providers";
import type { Article, FeedProvider } from "@/types/article";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ArticlesPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [providers, setProviders] = useState<FeedProvider[]>([]);

  useEffect(() => {
    setArticles(loadArticles());
    setProviders(loadFeedProviders());
  }, []);

  function handleDelete(id: string, slug: string) {
    if (!window.confirm(`Delete article "${slug}"? This cannot be undone.`)) return;
    deleteArticle(id);
    setArticles(loadArticles());
  }

  const providerMap = Object.fromEntries(providers.map((p) => [p.id, p]));

  // Group articles by feed provider
  const grouped: Record<string, Article[]> = {};
  for (const article of articles) {
    if (!grouped[article.feedProviderId]) grouped[article.feedProviderId] = [];
    grouped[article.feedProviderId].push(article);
  }
  const sortedProviderIds = Object.keys(grouped).sort((a, b) => {
    const nameA = providerMap[a]?.name ?? a;
    const nameB = providerMap[b]?.name ?? b;
    return nameA.localeCompare(nameB);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
          <p className="text-sm text-gray-500 mt-1">
            Landing pages for paid campaigns. Each article belongs to a feed provider.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/articles/feed-providers"
            className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            Manage Feed Providers
          </Link>
          <Button onClick={() => router.push("/dashboard/articles/new")}>
            + Add Article
          </Button>
        </div>
      </div>

      {articles.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-500 text-sm">No articles saved yet.</p>
          {providers.length === 0 && (
            <p className="text-xs text-gray-400">
              You'll need a{" "}
              <Link href="/dashboard/articles/feed-providers/new" className="underline text-cyan-600">
                feed provider
              </Link>{" "}
              before adding articles.
            </p>
          )}
          <Button
            variant="secondary"
            onClick={() => router.push("/dashboard/articles/new")}
          >
            Add your first article
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedProviderIds.map((providerId) => {
            const provider = providerMap[providerId];
            const providerArticles = grouped[providerId];
            return (
              <div key={providerId}>
                <div className="flex items-baseline gap-2 mb-3">
                  <h2 className="text-base font-semibold text-gray-700">
                    {provider?.name ?? "Unknown Provider"}
                  </h2>
                  {provider && (
                    <span className="text-xs text-gray-400 font-mono">
                      ?{provider.parameterName}=…
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    ({providerArticles.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {providerArticles.map((article) => (
                    <Card key={article.id} className="flex flex-col gap-3">
                      <div>
                        <p className="font-mono text-sm font-semibold text-gray-900 break-all">
                          {article.slug}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {article.allowedHeadlines.length === 0
                            ? "No headline restrictions"
                            : `${article.allowedHeadlines.length} allowed headline${article.allowedHeadlines.length === 1 ? "" : "s"}`}
                        </p>
                        {article.allowedHeadlines.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {article.allowedHeadlines.slice(0, 3).map((h, i) => (
                              <li key={i} className="text-xs text-gray-400 truncate">
                                "{h}"
                              </li>
                            ))}
                            {article.allowedHeadlines.length > 3 && (
                              <li className="text-xs text-gray-400">
                                +{article.allowedHeadlines.length - 3} more
                              </li>
                            )}
                          </ul>
                        )}
                      </div>

                      <p className="text-xs text-gray-500">
                        Added: {formatDate(article.createdAt)}
                      </p>

                      <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1"
                          onClick={() =>
                            router.push(`/dashboard/articles/${article.id}/edit`)
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1 text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(article.id, article.slug)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
