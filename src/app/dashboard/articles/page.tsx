"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui";
import { loadArticles, deleteArticle, toggleArticleStatus, duplicateArticle } from "@/lib/articles";
import { loadFeedProviders } from "@/lib/feed-providers";
import type { Article } from "@/types/article";
import type { FeedProvider } from "@/types/feed-provider";

const PROVIDER_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b"];

const LOCALES: Record<string, string> = {
  de_DE: "German - Germany",
  en_AU: "English - Australia",
  en_CA: "English - Canada",
  en_GB: "English - UK",
  es_AR: "Spanish - Argentina",
  es_ES: "Spanish - Spain",
  pt_BR: "Portuguese - Brazil",
  fr_FR: "French - France",
  it_IT: "Italian - Italy",
  en_US: "English - US",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type SortCol = "provider" | "slug" | "headlines" | "date";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "active" | "paused";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300">↕</span>;
  return <span className="ml-1 text-cyan-500">{dir === "asc" ? "↑" : "↓"}</span>;
}

const TOTAL_COLS = 8;

export default function ArticlesPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [providers, setProviders] = useState<FeedProvider[]>([]);
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [filterProvider, setFilterProvider] = useState("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function reload() {
    setArticles(loadArticles());
  }

  useEffect(() => {
    reload();
    setProviders(loadFeedProviders());
  }, []);

  const providerColorMap = useMemo(() => {
    const sorted = [...providers].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const map: Record<string, string> = {};
    sorted.forEach((p, i) => {
      map[p.id] = PROVIDER_COLORS[i % PROVIDER_COLORS.length];
    });
    return map;
  }, [providers]);

  const providerMap = useMemo(
    () => Object.fromEntries(providers.map((p) => [p.id, p])),
    [providers]
  );

  function handleDelete(id: string, slug: string) {
    if (!window.confirm(`Delete article "${slug}"? This cannot be undone.`)) return;
    deleteArticle(id);
    reload();
  }

  function handleToggleStatus(id: string) {
    toggleArticleStatus(id);
    reload();
  }

  function handleDuplicate(id: string) {
    duplicateArticle(id);
    reload();
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
    if (filterStatus !== "all") {
      rows = rows.filter((a) => a.status === filterStatus);
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
  }, [articles, search, filterProvider, filterStatus, sortCol, sortDir, providerMap]);

  const thClass =
    "px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 whitespace-nowrap";
  const thStatic =
    "px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap";
  const tdClass = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300 align-middle";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Articles</h1>
          <p className="text-sm text-gray-500 mt-1">
            Landing pages for paid campaigns. Each article belongs to a feed provider.
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/articles/new")}>
          + Add Article
        </Button>
      </div>

      {articles.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center space-y-3">
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
              placeholder="Search by keyword…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              <option value="all">All providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
              className="border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
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
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className={thClass} onClick={() => toggleSort("provider")}>
                        Provider <SortIcon active={sortCol === "provider"} dir={sortDir} />
                      </th>
                      <th className={thClass} onClick={() => toggleSort("slug")}>
                        Keyword <SortIcon active={sortCol === "slug"} dir={sortDir} />
                      </th>
                      <th className={thStatic}>Language</th>
                      <th className={thStatic}>Domain</th>
                      <th className={thStatic}>Traffic</th>
                      <th className={thClass} onClick={() => toggleSort("headlines")}>
                        Headlines <SortIcon active={sortCol === "headlines"} dir={sortDir} />
                      </th>
                      <th className={thClass} onClick={() => toggleSort("date")}>
                        Added <SortIcon active={sortCol === "date"} dir={sortDir} />
                      </th>
                      <th className={thStatic}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((article, i) => {
                      const provider = providerMap[article.feedProviderId];
                      const isPaused = article.status === "paused";
                      const color = isPaused ? "#6b7280" : (providerColorMap[article.feedProviderId] ?? "#94a3b8");
                      const isExpanded = expandedRows.has(article.id);

                      // Headline preview: first headline is always the default
                      const previewHeadline = article.allowedHeadlines[0]?.text;

                      return (
                        <>
                          <tr
                            key={article.id}
                            className={`border-b border-gray-100 dark:border-gray-700 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-gray-800/20"} ${isExpanded ? "border-b-0" : "last:border-0"} ${isPaused ? "opacity-50" : "hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                            style={{ borderLeft: `3px solid ${color}` }}
                          >
                            {/* Provider */}
                            <td className={tdClass}>
                              <div className="flex items-center gap-1.5 flex-wrap">
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
                                {isPaused && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700 uppercase tracking-wide">
                                    Paused
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Keyword + headline preview */}
                            <td className={tdClass}>
                              <div className="flex flex-col">
                                <span className="font-mono text-xs text-gray-800 dark:text-gray-200 break-all">
                                  {article.slug}
                                </span>
                                {previewHeadline && (
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[220px]">
                                    {previewHeadline}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Language */}
                            <td className={tdClass}>
                              {article.locale ? (
                                <span className="text-xs text-gray-600 dark:text-gray-300">
                                  {LOCALES[article.locale] ?? article.locale}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>

                            {/* Domain */}
                            <td className={tdClass}>
                              {article.domain ? (
                                <span className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate max-w-[140px] block" title={article.domain}>
                                  {article.domain}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>

                            {/* Traffic Sources */}
                            <td className={tdClass}>
                              <div className="flex items-center gap-1 flex-wrap">
                                {(article.trafficSources ?? ["Snap", "Meta"]).includes("Snap") && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
                                    Snap
                                  </span>
                                )}
                                {(article.trafficSources ?? ["Snap", "Meta"]).includes("Meta") && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                                    Meta
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Headlines */}
                            <td className={tdClass}>
                              {article.allowedHeadlines.length === 0 ? (
                                <span className="text-xs text-gray-300">any</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(article.id)}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-cyan-100 hover:text-cyan-700 cursor-pointer transition-colors"
                                >
                                  {article.allowedHeadlines.length}
                                  <span className="ml-1 text-gray-400">{isExpanded ? "▲" : "▼"}</span>
                                </button>
                              )}
                            </td>

                            {/* Added */}
                            <td className={`${tdClass} text-xs text-gray-500 whitespace-nowrap`}>
                              {formatDate(article.createdAt)}
                            </td>

                            {/* Actions */}
                            <td className={tdClass}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Status toggle */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(article.id)}
                                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors border ${
                                    isPaused
                                      ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700 hover:bg-green-100"
                                      : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700 hover:bg-amber-100"
                                  }`}
                                >
                                  {isPaused ? "▶ Resume" : "⏸ Pause"}
                                </button>
                                {/* Duplicate */}
                                <button
                                  type="button"
                                  onClick={() => handleDuplicate(article.id)}
                                  className="px-3 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                  ⧉ Copy
                                </button>
                                {/* Edit */}
                                <button
                                  type="button"
                                  onClick={() => router.push(`/dashboard/articles/${article.id}/edit`)}
                                  className="px-3 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                  Edit
                                </button>
                                {article.previewUrl && (
                                  <button
                                    type="button"
                                    onClick={() => window.open(article.previewUrl, "_blank", "noopener")}
                                    className="px-3 py-1 text-xs font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors"
                                  >
                                    Preview
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDelete(article.id, article.slug)}
                                  className="px-3 py-1 text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded headlines row */}
                          {isExpanded && article.allowedHeadlines.length > 0 && (
                            <tr
                              key={`${article.id}-expanded`}
                              className={`bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 last:border-0 ${isPaused ? "opacity-50" : ""}`}
                              style={{ borderLeft: `3px solid ${color}` }}
                            >
                              <td colSpan={TOTAL_COLS} className="px-8 py-3">
                                <div className="space-y-1.5">
                                  {article.allowedHeadlines.map((h, idx) => (
                                    <div key={idx} className="flex items-center gap-3 text-xs flex-wrap">
                                      <span className="text-gray-300 dark:text-gray-600 w-4 text-right shrink-0 font-mono">
                                        {idx + 1}.
                                      </span>
                                      <span className="font-mono text-gray-800 dark:text-gray-200 flex-1 min-w-[8rem]">{h.text}</span>
                                      {h.rac && (
                                        <span className="text-gray-400 shrink-0">
                                          rac:{" "}
                                          <span className="text-gray-600 font-medium">{h.rac}</span>
                                        </span>
                                      )}
                                      {(h.metaHeadline || h.metaPrimaryText) && (
                                        <span className="text-blue-400 shrink-0">
                                          meta:{" "}
                                          <span className="text-blue-600 dark:text-blue-300 font-medium">
                                            {h.metaHeadline}
                                            {h.metaHeadline && h.metaPrimaryText ? " — " : ""}
                                            {h.metaPrimaryText}
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
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
