"use client";

import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/hooks/useCanvasStore";
import { CanvasEdges, type EdgeDef } from "./CanvasEdges";
import { SiloBrowser } from "@/components/silo/SiloBrowser";
import { loadFeedProviders } from "@/lib/feed-providers";
import { loadArticles } from "@/lib/articles";
import { loadPresets } from "@/lib/presets";
import { loadAdAccountConfigs } from "@/lib/adAccounts";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { getAssetById } from "@/lib/silo";
import type { FeedProvider } from "@/types/feed-provider";
import type { Article } from "@/types/article";
import type { CampaignPreset } from "@/types/preset";
import type { SiloAsset } from "@/types/silo";
import type { AdAccountConfig } from "@/types/ad-account";

const PROVIDER_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899", "#f59e0b"];

interface ColumnHeaderProps { title: string; count: number; action?: React.ReactNode }
function ColumnHeader({ title, count, action }: ColumnHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3 px-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        {count > 0 && (
          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{count}</span>
        )}
      </div>
      {action}
    </div>
  );
}

function NodeCard({
  nodeId,
  connected,
  invalid,
  connectedColor,
  connectedColors,
  disabled,
  onClick,
  children,
}: {
  nodeId: string;
  connected: boolean;
  invalid?: boolean;
  connectedColor?: string;
  connectedColors?: string[];
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const handleClick = disabled ? undefined : onClick;

  // Multi-color gradient border for creatives connected to multiple providers
  if (connected && connectedColors && connectedColors.length > 1) {
    const gradStyle: React.CSSProperties = {
      border: "2px solid transparent",
      backgroundImage: `linear-gradient(white, white), linear-gradient(to right, ${connectedColors.join(", ")})`,
      backgroundClip: "padding-box, border-box",
      backgroundOrigin: "border-box",
    };
    return (
      <div
        data-node-id={nodeId}
        onClick={handleClick}
        style={gradStyle}
        className={`relative rounded-xl p-3 transition-all select-none shadow-sm ${
          handleClick ? "cursor-pointer hover:shadow-md" : ""
        }`}
      >
        {children}
      </div>
    );
  }

  const connectedStyle =
    connected && connectedColor
      ? { borderColor: connectedColor, backgroundColor: `${connectedColor}18` }
      : undefined;

  return (
    <div
      data-node-id={nodeId}
      onClick={handleClick}
      style={connectedStyle}
      className={`relative rounded-xl border-2 p-3 transition-all select-none ${
        disabled ? "opacity-40 cursor-not-allowed" : handleClick ? "cursor-pointer hover:shadow-md" : ""
      } ${
        connected
          ? connectedColor
            ? "shadow-sm"
            : "border-blue-400 bg-blue-50/60 shadow-sm"
          : invalid
          ? "border-red-300 bg-red-50/30"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      {children}
    </div>
  );
}

interface CampaignCanvasProps {
  adAccountId?: string;
  onReview: () => void;
}

export function CampaignCanvas({ adAccountId, onReview }: CampaignCanvasProps) {
  const store = useCanvasStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const [providers, setProviders] = useState<FeedProvider[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [presets, setPresets] = useState<CampaignPreset[]>([]);
  const [creativeAssets, setCreativeAssets] = useState<SiloAsset[]>([]);
  const [siloOpen, setSiloOpen] = useState(false);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [adAccountConfigs, setAdAccountConfigs] = useState<AdAccountConfig[]>([]);
  const { accounts: allAccounts } = useAdAccounts();

  useEffect(() => {
    setProviders(loadFeedProviders());
    setArticles(loadArticles());
    setPresets(loadPresets());
    setAdAccountConfigs(loadAdAccountConfigs());
  }, []);

  useEffect(() => {
    const assets = store.creativeIds
      .map((id) => getAssetById(id))
      .filter((a): a is SiloAsset => Boolean(a));
    setCreativeAssets(assets);
  }, [store.creativeIds]);

  // Sort providers by creation date for stable color assignment
  const sortedByCreation = [...providers].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const providerColorMap: Record<string, string> = {};
  sortedByCreation.forEach((p, i) => {
    providerColorMap[p.id] = PROVIDER_COLORS[i % PROVIDER_COLORS.length];
  });
  const sortedProviderOrder = sortedByCreation.map((p) => p.id);

  // Providers connected to at least one creative
  const activeProviderIds = new Set(store.edges.creativeToProvider.map((e) => e.feedProviderId));

  // Providers with at least one article connected
  const activeProviderIdsFromArticles = new Set(
    store.edges.providerToArticle.map((e) => e.feedProviderId)
  );

  const activeArticleIds = new Set(store.edges.providerToArticle.map((e) => e.articleId));

  // Articles: only those belonging to an active provider, sorted by provider order
  const visibleArticles = articles.filter((a) => activeProviderIds.has(a.feedProviderId));
  const sortedVisibleArticles = [...visibleArticles].sort((a, b) => {
    const ai = sortedProviderOrder.indexOf(a.feedProviderId);
    const bi = sortedProviderOrder.indexOf(b.feedProviderId);
    return ai !== bi ? ai - bi : a.slug.localeCompare(b.slug);
  });

  // Presets: only show after articles are connected (enforces the flow)
  const visiblePresets = presets.filter(
    (p) => !p.feedProviderId || activeProviderIdsFromArticles.has(p.feedProviderId)
  );
  const sortedVisiblePresets = [...visiblePresets].sort((a, b) => {
    const ai = sortedProviderOrder.indexOf(a.feedProviderId ?? "");
    const bi = sortedProviderOrder.indexOf(b.feedProviderId ?? "");
    return ai !== bi ? ai - bi : a.name.localeCompare(b.name);
  });

  // Ad accounts: filter by providers that have articles connected (prevents cross-provider mismatch)
  const visibleAccounts = allAccounts.filter((a) => {
    const cfg = adAccountConfigs.find((c) => c.id === a.id);
    if (cfg?.hidden) return false;
    if (cfg && cfg.feedProviderIds.length > 0) {
      return [...activeProviderIdsFromArticles].some((pid) => cfg.feedProviderIds.includes(pid));
    }
    return true; // unmanaged accounts: always show
  });
  const sortedVisibleAccounts = [...visibleAccounts].sort((a, b) => {
    const aCfg = adAccountConfigs.find((c) => c.id === a.id);
    const bCfg = adAccountConfigs.find((c) => c.id === b.id);
    const ai = sortedProviderOrder.indexOf(aCfg?.feedProviderIds[0] ?? "");
    const bi = sortedProviderOrder.indexOf(bCfg?.feedProviderIds[0] ?? "");
    return ai !== bi ? ai - bi : a.name.localeCompare(b.name);
  });

  // Auto-deselect accounts no longer visible
  const visibleAccountIdKey = visibleAccounts.map((a) => a.id).join(",");
  useEffect(() => {
    const visibleIds = new Set(visibleAccounts.map((a) => a.id));
    const stale = store.selectedAdAccountIds.filter((id) => !visibleIds.has(id));
    if (stale.length > 0) {
      store.setSelectedAdAccountIds(store.selectedAdAccountIds.filter((id) => visibleIds.has(id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleAccountIdKey]);

  // Gate: presets require an ad account selection
  const canSelectPresets = store.selectedAdAccountIds.length > 0;

  // Build SVG edges
  const edgeDefs: EdgeDef[] = [];

  for (const e of store.edges.creativeToProvider) {
    edgeDefs.push({
      id: `cp-${e.creativeId}-${e.feedProviderId}`,
      fromNodeId: `creative-${e.creativeId}`,
      toNodeId: `provider-${e.feedProviderId}`,
      color: providerColorMap[e.feedProviderId] ?? "#94a3b8",
    });
  }
  for (const e of store.edges.providerToArticle) {
    edgeDefs.push({
      id: `pa-${e.feedProviderId}-${e.articleId}`,
      fromNodeId: `provider-${e.feedProviderId}`,
      toNodeId: `article-${e.articleId}`,
      color: providerColorMap[e.feedProviderId] ?? "#94a3b8",
    });
  }
  // article → adAccount: only for provider-matching accounts
  for (const ae of store.edges.providerToArticle) {
    const provColor = providerColorMap[ae.feedProviderId] ?? "#94a3b8";
    for (const accountId of store.selectedAdAccountIds) {
      const accCfg = adAccountConfigs.find((c) => c.id === accountId);
      const matches = !accCfg?.feedProviderIds.length || accCfg.feedProviderIds.includes(ae.feedProviderId);
      if (!matches) continue;
      edgeDefs.push({
        id: `aa-${ae.articleId}-${accountId}`,
        fromNodeId: `article-${ae.articleId}`,
        toNodeId: `account-${accountId}`,
        color: provColor,
      });
    }
  }
  // adAccount → preset
  for (const pe of store.edges.articleToPreset) {
    const provEdge = store.edges.providerToArticle.find((e) => e.articleId === pe.articleId);
    const provColor = provEdge ? (providerColorMap[provEdge.feedProviderId] ?? "#94a3b8") : "#94a3b8";
    const provId = provEdge?.feedProviderId;
    for (const accountId of store.selectedAdAccountIds) {
      const accCfg = adAccountConfigs.find((c) => c.id === accountId);
      const matches = !provId || !accCfg?.feedProviderIds.length || accCfg.feedProviderIds.includes(provId);
      if (!matches) continue;
      edgeDefs.push({
        id: `ap2-${accountId}-${pe.presetId}-${pe.articleId}`,
        fromNodeId: `account-${accountId}`,
        toNodeId: `preset-${pe.presetId}`,
        color: provColor,
      });
    }
  }

  const siloAdAccountId = store.selectedAdAccountIds[0] ?? adAccountId ?? "";
  const matrix = store.buildCampaignMatrix();
  const isValid = matrix.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">Campaign Builder</span>
          {matrix.length > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {matrix.length} campaign{matrix.length !== 1 ? "s" : ""} ready
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={!isValid}
          onClick={onReview}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Review →
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-x-auto overflow-y-auto p-6"
        style={{ minHeight: 0 }}
      >
        <CanvasEdges edges={edgeDefs} containerRef={containerRef} />

        <div className="flex gap-6 min-w-max items-start">
          {/* Column 1 — Creatives */}
          <div className="w-56 shrink-0">
            <ColumnHeader
              title="Creatives"
              count={store.creativeIds.length}
              action={
                <button
                  type="button"
                  onClick={() => setSiloOpen(true)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Add
                </button>
              }
            />
            <div className="space-y-2">
              {creativeAssets.map((asset) => {
                const connected = store.edges.creativeToProvider.some((e) => e.creativeId === asset.id);
                const connectedProviderColors = store.edges.creativeToProvider
                  .filter((e) => e.creativeId === asset.id)
                  .map((e) => providerColorMap[e.feedProviderId] ?? "#94a3b8");
                return (
                  <NodeCard
                    key={asset.id}
                    nodeId={`creative-${asset.id}`}
                    connected={connected}
                    connectedColors={connectedProviderColors.length > 1 ? connectedProviderColors : undefined}
                    connectedColor={connectedProviderColors.length === 1 ? connectedProviderColors[0] : undefined}
                    invalid={!connected && store.creativeIds.length > 0}
                  >
                    <div className="flex items-start gap-2">
                      {asset.thumbnailUrl ? (
                        <img src={asset.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-400 text-xs">
                          {asset.mediaType === "VIDEO" ? "▶" : "🖼"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{asset.originalFileName}</p>
                        <p className="text-xs text-gray-400">{asset.mediaType}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); store.removeCreative(asset.id); }}
                        className="text-gray-300 hover:text-red-500 shrink-0 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  </NodeCard>
                );
              })}
              {store.creativeIds.length === 0 && (
                <button
                  type="button"
                  onClick={() => setSiloOpen(true)}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors text-center"
                >
                  Click to select from Silo
                </button>
              )}
            </div>
          </div>

          {/* Column 2 — Feed Providers */}
          <div className="w-52 shrink-0">
            <ColumnHeader title="Feed Providers" count={activeProviderIds.size} />
            <div className="space-y-2">
              {providers.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No providers configured.</p>
              )}
              {sortedByCreation.map((provider) => {
                const color = providerColorMap[provider.id];
                const connected = activeProviderIds.has(provider.id);
                const connectedCreatives = store.edges.creativeToProvider
                  .filter((e) => e.feedProviderId === provider.id)
                  .map((e) => e.creativeId);
                return (
                  <NodeCard
                    key={provider.id}
                    nodeId={`provider-${provider.id}`}
                    connected={connected}
                    connectedColor={connected ? color : undefined}
                    onClick={() => {
                      if (store.creativeIds.length > 0) {
                        store.creativeIds.forEach((cId) =>
                          store.toggleCreativeToProvider(cId, provider.id)
                        );
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span className="text-sm font-medium text-gray-800 truncate">{provider.name}</span>
                    </div>
                    {connected && (
                      <p className="text-xs text-gray-400 mt-1 pl-4">
                        {connectedCreatives.length} creative{connectedCreatives.length !== 1 ? "s" : ""}
                      </p>
                    )}
                  </NodeCard>
                );
              })}
            </div>
          </div>

          {/* Column 3 — Articles */}
          <div className="w-64 shrink-0">
            <ColumnHeader
              title="Articles"
              count={store.edges.providerToArticle.length}
            />
            <div className="space-y-2">
              {activeProviderIds.size === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Connect a feed provider first.</p>
              )}
              {sortedVisibleArticles.map((article) => {
                const provider = providers.find((p) => p.id === article.feedProviderId);
                const provColor = provider ? providerColorMap[provider.id] : "#94a3b8";
                const articleEdges = store.edges.providerToArticle.filter((e) => e.articleId === article.id);
                const connected = articleEdges.length > 0;
                const isExpanded = expandedArticle === article.id;

                return (
                  <div key={article.id}>
                    <NodeCard
                      nodeId={`article-${article.id}`}
                      connected={connected}
                      connectedColor={connected ? provColor : undefined}
                      onClick={() => {
                        const activeForThisArticle = [...activeProviderIds].filter(
                          (pId) => pId === article.feedProviderId
                        );
                        activeForThisArticle.forEach((pId) =>
                          store.toggleProviderToArticle(pId, article.id)
                        );
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                          style={{ background: provColor }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{article.slug}</p>
                          {article.query && (
                            <p className="text-xs text-gray-400 truncate">{article.query}</p>
                          )}
                        </div>
                        {connected && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedArticle(isExpanded ? null : article.id); }}
                            className="text-xs text-gray-400 hover:text-gray-600 shrink-0"
                          >
                            {isExpanded ? "▲" : "▼"}
                          </button>
                        )}
                      </div>
                    </NodeCard>

                    {/* Inline headline + CTA editor */}
                    {connected && isExpanded && articleEdges.map((ae) => (
                      <div
                        key={`${ae.feedProviderId}-${ae.articleId}`}
                        className="mt-1 ml-2 border border-blue-200 rounded-lg p-2 space-y-2 bg-blue-50/40"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div>
                          <label className="text-xs text-gray-500 block mb-0.5">Headline</label>
                          {article.allowedHeadlines.length > 0 ? (
                            <select
                              value={ae.headline}
                              onChange={(e) =>
                                store.setArticleContent(ae.feedProviderId, article.id, e.target.value, ae.callToAction)
                              }
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            >
                              <option value="">— Select headline —</option>
                              {article.allowedHeadlines.map((h) => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              maxLength={34}
                              value={ae.headline}
                              placeholder="Headline (max 34 chars)"
                              onChange={(e) =>
                                store.setArticleContent(ae.feedProviderId, article.id, e.target.value, ae.callToAction)
                              }
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-0.5">Call to Action</label>
                          <select
                            value={ae.callToAction}
                            onChange={(e) =>
                              store.setArticleContent(ae.feedProviderId, article.id, ae.headline, e.target.value)
                            }
                            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          >
                            <option value="">— None —</option>
                            {["MORE","SHOP_NOW","SIGN_UP","DOWNLOAD","WATCH","GET_NOW","ORDER_NOW","BOOK_NOW","APPLY_NOW","BUY_NOW"].map((c) => (
                              <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 4 — Ad Accounts */}
          <div className="w-52 shrink-0">
            <ColumnHeader title="Ad Accounts" count={store.selectedAdAccountIds.length} />
            <div className="space-y-2">
              {activeProviderIdsFromArticles.size === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Connect an article first.</p>
              )}
              {activeProviderIdsFromArticles.size > 0 && visibleAccounts.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No ad accounts assigned to this provider.</p>
              )}
              {sortedVisibleAccounts.map((account) => {
                const accCfg = adAccountConfigs.find((c) => c.id === account.id);
                const accProviderColor = accCfg?.feedProviderIds.length
                  ? (providerColorMap[accCfg.feedProviderIds[0]] ?? "#94a3b8")
                  : "#94a3b8";
                const selected = store.selectedAdAccountIds.includes(account.id);
                return (
                  <NodeCard
                    key={account.id}
                    nodeId={`account-${account.id}`}
                    connected={selected}
                    connectedColor={selected ? accProviderColor : undefined}
                    onClick={() => store.toggleAdAccount(account.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: selected ? accProviderColor : "#d1d5db" }}
                      />
                      <span className="text-sm font-medium text-gray-800 truncate">{account.name}</span>
                    </div>
                    {selected && (
                      <p className="text-xs text-gray-400 mt-1 pl-4 truncate">{account.id.slice(0, 8)}…</p>
                    )}
                  </NodeCard>
                );
              })}
            </div>
          </div>

          {/* Column 5 — Presets */}
          <div className="w-60 shrink-0">
            <ColumnHeader title="Presets" count={store.edges.articleToPreset.length} />
            <div className="space-y-2">
              {activeArticleIds.size === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Connect an article first.</p>
              )}
              {activeArticleIds.size > 0 && !canSelectPresets && (
                <p className="text-xs text-amber-600 text-center py-2 px-2 bg-amber-50/80 rounded-lg border border-amber-200">
                  Select an ad account first
                </p>
              )}
              {sortedVisiblePresets.map((preset) => {
                const provider = preset.feedProviderId ? providers.find((p) => p.id === preset.feedProviderId) : null;
                const provColor = provider ? providerColorMap[provider.id] : "#94a3b8";
                const presetEdges = store.edges.articleToPreset.filter((e) => e.presetId === preset.id);
                const connected = presetEdges.length > 0;

                return (
                  <NodeCard
                    key={preset.id}
                    nodeId={`preset-${preset.id}`}
                    connected={connected}
                    connectedColor={connected ? provColor : undefined}
                    disabled={!canSelectPresets}
                    onClick={() => {
                      const matchingArticles = [...activeArticleIds].filter((aId) => {
                        const article = articles.find((a) => a.id === aId);
                        return article && (!preset.feedProviderId || article.feedProviderId === preset.feedProviderId);
                      });
                      matchingArticles.forEach((aId) => store.toggleArticleToPreset(aId, preset.id));
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {provider && (
                        <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: provColor }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{preset.name}</p>
                        <p className="text-xs text-gray-400">
                          {preset.adSquads[0]?.geoCountryCodes?.join(", ") ?? ""}
                          {preset.adSquads[0]?.dailyBudgetUsd ? ` · $${preset.adSquads[0].dailyBudgetUsd}/day` : ""}
                        </p>
                      </div>
                    </div>

                    {/* Duplication counter per article connection */}
                    {connected && (
                      <div className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                        {presetEdges.map((pe) => {
                          const article = articles.find((a) => a.id === pe.articleId);
                          return (
                            <div key={pe.articleId} className="flex items-center gap-2 justify-between">
                              <span className="text-xs text-gray-500 truncate">{article?.slug ?? pe.articleId}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => store.setDuplications(pe.articleId, preset.id, pe.duplications - 1)}
                                  className="w-5 h-5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded flex items-center justify-center"
                                >
                                  −
                                </button>
                                <span className="text-xs font-medium text-gray-700 w-5 text-center">{pe.duplications}</span>
                                <button
                                  type="button"
                                  onClick={() => store.setDuplications(pe.articleId, preset.id, pe.duplications + 1)}
                                  className="w-5 h-5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded flex items-center justify-center"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </NodeCard>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Silo Browser modal */}
      <SiloBrowser
        isOpen={siloOpen}
        onClose={() => setSiloOpen(false)}
        onSelect={(asset) => {
          store.addCreative(asset.id);
          setSiloOpen(false);
        }}
        adAccountId={siloAdAccountId}
      />
    </div>
  );
}
