"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui";
import { loadArticles, deleteArticle } from "@/lib/articles";
import { loadFeedProviders } from "@/lib/feed-providers";
import type { Article } from "@/types/article";
import type { FeedProvider } from "@/types/feed-provider";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function providerColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h},65%,45%)`;
}

type SortCol = "provider" | "slug" | "query" | "headlines" | "date";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1 text-cyan-500">{dir === "asc" ? "↑" : "↓"}</span>;
}

export default function ArticlesPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [providers, setProviders] = useState<FeedProvider[]>([]);
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [filterProvider, setFilterProvider] = useState("all");

  useEffect(() => {
    setArticles(loadArticles());
    setProviders(loadFeedProviders());
  }, []);

  const providerMap = useMemo(
    () => Object.fromEntries(providers.map((p) => [p.id, p])),
    [providers]
  );

  function handleDelete(id: string, slug: string) {
    if (!window.confirm(`Delete article "${slug}"? This cannot be undone.`)) return;
    deleteArticle(id);
    setArticles(loadArticles());
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    let rows = [...articles];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((a) => a.slug.toLowerCase().includes(q));
    }
    if (filterProvider !== "all") {
      rows = rows.filter((a) => a.feedProviderId === filterProvider);
    }

    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "provider": {
          const na = providerMap[a.feedProviderId]?.name ?? a.feedProviderId;
          const nb = providerMap[b.feedProviderId]?.name ?? b.feedProviderId;
          cmp = na.localeCompare(nb);
          break;
        }
        case "slug":
          cmp = a.slug.localeCompare(b.slug);
          break;
        case "query":
          cmp = (a.query ?? "").localeCompare(b.query ?? "");
          break;
        case "headlines":
          cmp = a.allowedHeadlines.length - b.allowedHeadlines.length;
          break;
        case "date":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [articles, search, filterProvider, sortCol, sortDir, providerMap]);

  const thClass =
    "px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 whitespace-nowrap";
  const tdClass = "px-4 py-3 text-sm text-gray-700 align-middle";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
          <p className="text-sm text-gray-500 mt-1">
            Landing pages for paid campaigns. Each article belongs to a feed provider.
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/articles/new")}>
          + Add Article
        </Button>
      </div>

      {articles.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-500 text-sm">No articles saved yet.</p>
          {providers.length === 0 && (
            <p className="text-xs text-gray-400">
              You&apos;ll need a{" "}
              <Link href="/dashboard/feed-providers" className="underline text-cyan-600">
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
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              placeholder="Search by slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              <option value="all">All providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="ml-auto text-xs text-gray-400">
              {filtered.length} article{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
              <p className="text-gray-500 text-sm">No articles match your search.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className={thClass} onClick={() => toggleSort("provider")}>
                        Provider <SortIcon active={sortCol === "provider"} dir={sortDir} />
                      </th>
                      <th className={thClass} onClick={() => toggleSort("slug")}>
                        Slug <SortIcon active={sortCol === "slug"} dir={sortDir} />
                      </th>
                      <th className={thClass} onClick={() => toggleSort("query")}>
                        Query <SortIcon active={sortCol === "query"} dir={sortDir} />
                      </th>
                      <th className={thClass} onClick={() => toggleSort("headlines")}>
                        Headlines <SortIcon active={sortCol === "headlines"} dir={sortDir} />
                      </th>
                      <th className={thClass} onClick={() => toggleSort("date")}>
                        Added <SortIcon active={sortCol === "date"} dir={sortDir} />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((article, i) => {
                      const provider = providerMap[article.feedProviderId];
                      const color = providerColor(article.feedProviderId);
                      return (
                        <tr
                          key={article.id}
                          className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/40"}`}
                          style={{ borderLeft: `3px solid ${color}` }}
                        >
                          {/* Provider */}
                          <td className={tdClass}>
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border"
                              style={{
                                backgroundColor: `${color}22`,
                                borderColor: `${color}55`,
                                color,
                              }}
                            >
                              {provider?.name ?? (
                                <span className="text-gray-400 italic">Unknown</span>
                              )}
                            </span>
                          </td>

                          {/* Slug */}
                          <td className={tdClass}>
                            <span className="font-mono text-xs text-gray-800 break-all">
                              {article.slug}
                            </span>
                          </td>

                          {/* Query */}
                          <td className={tdClass}>
                            {article.query ? (
                              <span className="text-xs text-gray-600 truncate max-w-[160px] block" title={article.query}>
                                {article.query}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>

                          {/* Headlines */}
                          <td className={tdClass}>
                            {article.allowedHeadlines.length === 0 ? (
                              <span className="text-xs text-gray-300">any</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                {article.allowedHeadlines.length}
                              </span>
                            )}
                          </td>

                          {/* Added */}
                          <td className={`${tdClass} text-xs text-gray-500 whitespace-nowrap`}>
                            {formatDate(article.createdAt)}
                          </td>

                          {/* Actions */}
                          <td className={tdClass}>
                            <div className="flex items-center gap-2">
                              <button
                                className="text-xs text-gray-600 hover:text-cyan-600 font-medium transition-colors"
                                onClick={() =>
                                  router.push(`/dashboard/articles/${article.id}/edit`)
                                }
                              >
                                Edit
                              </button>
                              <span className="text-gray-200">·</span>
                              <button
                                className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                                onClick={() => handleDelete(article.id, article.slug)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
