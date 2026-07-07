"use client";

import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSnapchatAuth } from "@/hooks/useSnapchatAuth";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { useMetaAdAccounts } from "@/hooks/useMetaAdAccounts";
import { useMetaAdLimits } from "@/hooks/useMetaAdLimits";
import { loadAdAccountConfigs, upsertAdAccountConfig } from "@/lib/adAccounts";
import { loadPageConfigs, upsertPageConfig } from "@/lib/pageConfigs";
import { loadFeedProviders, upsertFeedProvider } from "@/lib/feed-providers";
import { loadPixels, deletePixel } from "@/lib/pixels";
import { loadMetaPixels, deleteMetaPixel } from "@/lib/meta-pixels";
import { Button, Card, Badge, Spinner } from "@/components/ui";
import type { AdAccountConfig } from "@/types/ad-account";
import type { PageConfig } from "@/types/page-config";
import { DEFAULT_PAGE_AD_LIMIT } from "@/types/page-config";
import type { FeedProvider } from "@/types/feed-provider";
import type { SavedPixel } from "@/types/pixel";
import type { SavedMetaPixel } from "@/types/meta-pixel";

function SnapchatLogo({ className, title }: { className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center justify-center rounded-md bg-yellow-400 ${className ?? "w-6 h-6"}`}>
      <svg viewBox="0.87 -0.8 20.14 21.67" className="w-[86%] h-[86%]" fill="#fff" stroke="#111827" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
        <path d="M12.166.002c.83-.005 3.39.229 4.643 2.848.422.88.338 2.352.269 3.562l-.012.2c-.006.09.049.125.106.101.225-.093.456-.24.7-.397.328-.21.664-.426 1.021-.506a1.53 1.53 0 01.379-.024c.498.032.938.346 1.106.785.217.567-.045 1.128-.779 1.663-.118.086-.247.164-.375.241-.403.241-.732.437-.665.671.044.152.19.332.364.553.536.677 1.344 1.7 1.344 3.414 0 2.618-1.83 4.62-4.99 5.544-.193.056-.236.151-.267.27-.046.175-.085.325-.296.484-.271.2-.68.3-1.252.302-.494.002-1.102-.08-1.76-.167-.77-.102-1.566-.209-2.27-.153-.703.055-1.377.22-2.018.379-.548.138-1.072.27-1.572.27h-.049c-.545-.008-.938-.106-1.198-.3-.208-.158-.248-.307-.291-.48-.03-.117-.072-.212-.265-.268C3.83 18.625 2 16.623 2 14.005c0-1.715.808-2.737 1.344-3.414.174-.22.32-.401.364-.553.068-.233-.262-.43-.665-.671a5.39 5.39 0 01-.375-.241C1.934 8.59 1.672 8.03 1.89 7.46c.167-.439.608-.753 1.106-.785a1.51 1.51 0 01.379.024c.357.08.693.296 1.021.506.244.157.475.304.7.397.056.023.112-.011.106-.1l-.012-.201C5.12 6.09 5.037 4.617 5.46 3.736 6.574 1.388 8.91.807 10.316.36 10.83.193 11.444.006 12.166.002z" />
      </svg>
    </span>
  );
}

function MetaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

// Small platform badge used in the unified ad accounts table.
function PlatformIcon({ platform }: { platform: "snap" | "meta" }) {
  if (platform === "snap") {
    return <SnapchatLogo className="w-6 h-6 shrink-0" title="Snapchat" />;
  }
  return (
    <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center shrink-0" title="Meta">
      <MetaLogo className="w-3.5 h-3.5 text-white" />
    </div>
  );
}

type UnifiedAccount = {
  key: string;
  id: string;
  platform: "snap" | "meta";
  name: string;
  org?: string;
  timezone?: string;
  currency?: string;
};

const thClass =
  "px-3 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap";
const tdClass = "px-3 py-2 text-sm text-gray-700 dark:text-gray-300 align-middle";

export default function TrafficSourcesPage() {
  const router = useRouter();
  const { snapConnected, metaConnected, metaExpiresAt, isLoading: authLoading } = useSnapchatAuth();
  const { accounts: snapAccounts, isLoading: accountsLoading } = useAdAccounts();
  const { accounts: metaAccounts, isLoading: metaAccountsLoading } = useMetaAdAccounts();
  // Facebook Pages come from the ads_volume feed (the /me/accounts pages edge is
  // often empty), which also carries each page's running/in-review count.
  const { pages: adLimitPages, runningByPage, isLoading: pagesLoading, refresh: refreshAdLimits } =
    useMetaAdLimits();
  const metaPages = useMemo(
    () => adLimitPages.map((p) => ({ id: p.pageId, name: p.name, businessName: p.businessName })),
    [adLimitPages]
  );
  const [adAccountConfigs, setAdAccountConfigs] = useState<AdAccountConfig[]>([]);
  const [pageConfigs, setPageConfigs] = useState<PageConfig[]>([]);
  const [feedProviders, setFeedProviders] = useState<FeedProvider[]>([]);
  const [pixels, setPixels] = useState<SavedPixel[]>([]);
  const [metaPixels, setMetaPixels] = useState<SavedMetaPixel[]>([]);
  const [disconnecting, setDisconnecting] = useState(false);
  const [metaDisconnecting, setMetaDisconnecting] = useState(false);

  // Compact-table-specific UI state (search / filter / inline expand / hidden toggle).
  const [accountSearch, setAccountSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"all" | "snap" | "meta">("all");
  const [expandedAccountKey, setExpandedAccountKey] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  // Facebook Pages table UI state.
  const [pageSearch, setPageSearch] = useState("");
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);
  const [showHiddenPages, setShowHiddenPages] = useState(false);
  const [refreshingPages, setRefreshingPages] = useState(false);

  const handleRefreshPages = async () => {
    setRefreshingPages(true);
    try {
      await refreshAdLimits();
    } finally {
      setRefreshingPages(false);
    }
  };

  const reloadLocal = useCallback(() => {
    setAdAccountConfigs(loadAdAccountConfigs());
    setPageConfigs(loadPageConfigs());
    setFeedProviders(loadFeedProviders());
    setPixels(loadPixels());
    setMetaPixels(loadMetaPixels());
  }, []);

  useEffect(() => {
    reloadLocal();
  }, [reloadLocal]);

  const handleDisconnectSnap = async () => {
    if (!confirm("Disconnect Snapchat? Campaign creation will be unavailable until you reconnect.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/auth/snapchat/disconnect", { method: "POST" });
      window.location.reload();
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDisconnectMeta = async () => {
    if (!confirm("Disconnect Meta? Your Meta ad accounts will no longer be accessible.")) return;
    setMetaDisconnecting(true);
    try {
      await fetch("/api/auth/meta/disconnect", { method: "POST" });
      window.location.reload();
    } finally {
      setMetaDisconnecting(false);
    }
  };

  // Days until Meta token expires (long-lived tokens last ~60 days, no refresh).
  const metaTokenDaysLeft = metaExpiresAt
    ? Math.ceil((metaExpiresAt - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const getConfig = (accountId: string, platform: "snap" | "meta" = "snap"): AdAccountConfig => {
    const existing = adAccountConfigs.find((c) => c.id === accountId);
    if (existing) return existing;
    const account =
      platform === "meta"
        ? metaAccounts.find((a) => a.id === accountId)
        : snapAccounts.find((a) => a.id === accountId);
    return {
      id: accountId,
      name: account?.name ?? accountId,
      hidden: false,
      feedProviderIds: [],
      platform,
      updatedAt: new Date().toISOString(),
    };
  };

  const toggleHidden = (accountId: string, platform: "snap" | "meta" = "snap") => {
    const config = getConfig(accountId, platform);
    const updated = { ...config, hidden: !config.hidden, platform, updatedAt: new Date().toISOString() };
    upsertAdAccountConfig(updated);
    setAdAccountConfigs(loadAdAccountConfigs());
    syncFeedProviderAssignments(accountId, updated.feedProviderIds, !config.hidden, platform);
  };

  const toggleFeedProvider = (accountId: string, providerId: string, platform: "snap" | "meta" = "snap") => {
    const config = getConfig(accountId, platform);
    const alreadyAssigned = config.feedProviderIds.includes(providerId);
    const newProviderIds = alreadyAssigned
      ? config.feedProviderIds.filter((id) => id !== providerId)
      : [...config.feedProviderIds, providerId];
    const updated = { ...config, feedProviderIds: newProviderIds, platform, updatedAt: new Date().toISOString() };
    upsertAdAccountConfig(updated);
    setAdAccountConfigs(loadAdAccountConfigs());
    syncFeedProviderAssignments(accountId, newProviderIds, config.hidden, platform);
  };

  const syncFeedProviderAssignments = (
    accountId: string,
    newProviderIds: string[],
    isHidden: boolean,
    platform: "snap" | "meta" = "snap"
  ) => {
    const allProviders = loadFeedProviders();
    for (const provider of allProviders) {
      if (platform === "meta") {
        const metaCfg = provider.metaConfig ?? { allowedAdAccountIds: [], allowedPixelIds: [] };
        const wasAssigned = metaCfg.allowedAdAccountIds.includes(accountId);
        const shouldBeAssigned = !isHidden && newProviderIds.includes(provider.id);
        if (wasAssigned !== shouldBeAssigned) {
          const updated: FeedProvider = {
            ...provider,
            metaConfig: {
              ...metaCfg,
              allowedAdAccountIds: shouldBeAssigned
                ? [...metaCfg.allowedAdAccountIds, accountId]
                : metaCfg.allowedAdAccountIds.filter((id) => id !== accountId),
            },
          };
          upsertFeedProvider(updated);
        }
      } else {
        const wasAssigned = provider.snapConfig.allowedAdAccountIds.includes(accountId);
        const shouldBeAssigned = !isHidden && newProviderIds.includes(provider.id);
        if (wasAssigned !== shouldBeAssigned) {
          const updated: FeedProvider = {
            ...provider,
            snapConfig: {
              ...provider.snapConfig,
              allowedAdAccountIds: shouldBeAssigned
                ? [...provider.snapConfig.allowedAdAccountIds, accountId]
                : provider.snapConfig.allowedAdAccountIds.filter((id) => id !== accountId),
            },
          };
          upsertFeedProvider(updated);
        }
      }
    }
    setFeedProviders(loadFeedProviders());
  };

  // ---- Facebook Pages: config (hidden + provider assignment + ad-limit override) ----
  const getPageCfg = (pageId: string): PageConfig => {
    const existing = pageConfigs.find((c) => c.id === pageId);
    if (existing) return existing;
    const page = metaPages.find((p) => p.id === pageId);
    return {
      id: pageId,
      name: page?.name ?? pageId,
      hidden: false,
      feedProviderIds: [],
      updatedAt: new Date().toISOString(),
    };
  };

  const togglePageHidden = (pageId: string) => {
    const cfg = getPageCfg(pageId);
    const updated = { ...cfg, hidden: !cfg.hidden, updatedAt: new Date().toISOString() };
    upsertPageConfig(updated);
    setPageConfigs(loadPageConfigs());
    syncProviderPageAssignments(pageId, updated.feedProviderIds, !cfg.hidden);
  };

  const togglePageFeedProvider = (pageId: string, providerId: string) => {
    const cfg = getPageCfg(pageId);
    const alreadyAssigned = cfg.feedProviderIds.includes(providerId);
    const newProviderIds = alreadyAssigned
      ? cfg.feedProviderIds.filter((id) => id !== providerId)
      : [...cfg.feedProviderIds, providerId];
    const updated = { ...cfg, feedProviderIds: newProviderIds, updatedAt: new Date().toISOString() };
    upsertPageConfig(updated);
    setPageConfigs(loadPageConfigs());
    syncProviderPageAssignments(pageId, newProviderIds, cfg.hidden);
  };

  // Keep each provider's metaConfig.allowedPageIds in sync with page assignments,
  // and keep the legacy single pageId = first assigned page (used at ad launch as
  // a fallback; the launch path prefers the most-ads-remaining page).
  const syncProviderPageAssignments = (
    pageId: string,
    newProviderIds: string[],
    isHidden: boolean
  ) => {
    const allProviders = loadFeedProviders();
    for (const provider of allProviders) {
      const metaCfg = provider.metaConfig ?? { allowedAdAccountIds: [], allowedPixelIds: [] };
      const current = metaCfg.allowedPageIds ?? [];
      const wasAssigned = current.includes(pageId);
      const shouldBeAssigned = !isHidden && newProviderIds.includes(provider.id);
      if (wasAssigned !== shouldBeAssigned) {
        const nextPageIds = shouldBeAssigned
          ? [...current, pageId]
          : current.filter((id) => id !== pageId);
        const updated: FeedProvider = {
          ...provider,
          metaConfig: {
            ...metaCfg,
            allowedPageIds: nextPageIds,
            pageId: nextPageIds[0], // first assigned page (undefined when none)
          },
        };
        upsertFeedProvider(updated);
      }
    }
    setFeedProviders(loadFeedProviders());
  };

  const handleDeletePixel = (id: string, name: string) => {
    if (!confirm(`Delete pixel "${name}"? This cannot be undone.`)) return;
    deletePixel(id);
    setPixels(loadPixels());
  };

  const handleDeleteMetaPixel = (id: string, name: string) => {
    if (!confirm(`Delete pixel "${name}"? This cannot be undone.`)) return;
    deleteMetaPixel(id);
    setMetaPixels(loadMetaPixels());
  };

  // Merge Snap + Meta ad accounts into one unified list for the compact table.
  const unifiedAccounts = useMemo<UnifiedAccount[]>(() => {
    const snap: UnifiedAccount[] = snapAccounts.map((a) => ({
      key: `snap:${a.id}`,
      id: a.id,
      platform: "snap",
      name: a.name,
      org: a.organization_name,
      timezone: a.timezone,
      currency: a.currency,
    }));
    const meta: UnifiedAccount[] = metaAccounts.map((a) => ({
      key: `meta:${a.id}`,
      id: a.id,
      platform: "meta",
      name: a.name,
      org: a.business?.name,
      timezone: a.timezone_name,
      currency: a.currency,
    }));
    return [...snap, ...meta];
  }, [snapAccounts, metaAccounts]);

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    return unifiedAccounts.filter((a) => {
      if (platformFilter !== "all" && a.platform !== platformFilter) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [unifiedAccounts, accountSearch, platformFilter]);

  // Hidden status lives in adAccountConfigs (keyed by account id).
  const isAccountHidden = useCallback(
    (accountId: string) => adAccountConfigs.find((c) => c.id === accountId)?.hidden ?? false,
    [adAccountConfigs]
  );

  // Active accounts fill the main table; hidden accounts live in a collapsed table below.
  const activeAccounts = useMemo(
    () => filteredAccounts.filter((a) => !isAccountHidden(a.id)),
    [filteredAccounts, isAccountHidden]
  );
  const hiddenAccounts = useMemo(
    () => filteredAccounts.filter((a) => isAccountHidden(a.id)),
    [filteredAccounts, isAccountHidden]
  );
  // Total hidden count across ALL accounts (ignores search/filter) — for the collapsed header badge.
  const hiddenTotal = useMemo(
    () => unifiedAccounts.filter((a) => isAccountHidden(a.id)).length,
    [unifiedAccounts, isAccountHidden]
  );

  // ---- Facebook Pages derived state ----
  const pageCfgById = useMemo(() => {
    const m = new Map<string, PageConfig>();
    for (const c of pageConfigs) m.set(c.id, c);
    return m;
  }, [pageConfigs]);

  const pageStats = useCallback(
    (pageId: string) => {
      const running = runningByPage[pageId] ?? 0;
      const limit = DEFAULT_PAGE_AD_LIMIT; // Facebook's page ad limit is a fixed 250.
      return { running, limit, remaining: Math.max(0, limit - running) };
    },
    [runningByPage]
  );

  const filteredPages = useMemo(() => {
    const q = pageSearch.trim().toLowerCase();
    return metaPages
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.id.includes(q) ||
          (p.businessName ?? "").toLowerCase().includes(q)
      )
      .slice()
      // Most occupied first (most running / in-review ads), like the BM screen.
      .sort((a, b) => pageStats(b.id).running - pageStats(a.id).running);
  }, [metaPages, pageSearch, pageStats]);

  const activePages = useMemo(
    () => filteredPages.filter((p) => !pageCfgById.get(p.id)?.hidden),
    [filteredPages, pageCfgById]
  );
  const hiddenPages = useMemo(
    () => filteredPages.filter((p) => pageCfgById.get(p.id)?.hidden),
    [filteredPages, pageCfgById]
  );
  const hiddenPagesTotal = useMemo(
    () => metaPages.filter((p) => pageCfgById.get(p.id)?.hidden).length,
    [metaPages, pageCfgById]
  );

  const togglePageExpanded = (pageId: string) => {
    setExpandedPageId((prev) => (prev === pageId ? null : pageId));
  };

  const accountsSectionVisible = snapConnected || metaConnected;
  const accountsSectionLoading =
    (snapConnected && accountsLoading) || (metaConnected && metaAccountsLoading);

  const toggleExpanded = (key: string) => {
    setExpandedAccountKey((prev) => (prev === key ? null : key));
  };

  // Shared table renderer — used for both the active table and the collapsed hidden table.
  const renderAccountsTable = (list: UnifiedAccount[]) => (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className={`${thClass} w-8`}></th>
              <th className={thClass}>Account</th>
              <th className={thClass}>Org</th>
              <th className={thClass}>Timezone · Currency</th>
              <th className={thClass}>Feed Providers</th>
              <th className={thClass}>Status</th>
              <th className={`${thClass} w-8`}></th>
            </tr>
          </thead>
          <tbody>
            {list.map((a, i) => {
              const config = getConfig(a.id, a.platform);
              const isExpanded = expandedAccountKey === a.key;
              const assignedProviders = feedProviders.filter((fp) =>
                config.feedProviderIds.includes(fp.id)
              );

              return (
                <Fragment key={a.key}>
                  <tr
                    className={`border-b border-gray-100 dark:border-gray-700 transition-colors ${
                      i % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-gray-800/20"
                    } ${isExpanded ? "border-b-0" : "last:border-0"} hover:bg-gray-50 dark:hover:bg-gray-800/60`}
                  >
                    {/* Platform icon */}
                    <td className={tdClass}>
                      <PlatformIcon platform={a.platform} />
                    </td>

                    {/* Account name + id */}
                    <td className={tdClass}>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate max-w-[220px]">
                          {a.name}
                        </span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate max-w-[220px]">
                          {a.id}
                        </span>
                      </div>
                    </td>

                    {/* Org */}
                    <td className={tdClass}>
                      <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[140px] block">
                        {a.org || <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </span>
                    </td>

                    {/* Timezone · Currency */}
                    <td className={tdClass}>
                      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {[a.timezone, a.currency].filter(Boolean).join(" · ") || (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </span>
                    </td>

                    {/* Feed provider chips — click to expand assignment checklist */}
                    <td className={tdClass}>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(a.key)}
                        className="flex items-center gap-1 flex-wrap max-w-[220px] text-left group"
                      >
                        {assignedProviders.length === 0 ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500 italic group-hover:text-cyan-600 dark:group-hover:text-cyan-400">
                            Assign…
                          </span>
                        ) : (
                          assignedProviders.map((fp) => (
                            <span
                              key={fp.id}
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-700 truncate max-w-[100px]"
                            >
                              {fp.name}
                            </span>
                          ))
                        )}
                        <span className="text-gray-300 dark:text-gray-600 text-[10px]">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </button>
                    </td>

                    {/* Status toggle */}
                    <td className={tdClass}>
                      <button
                        type="button"
                        onClick={() => toggleHidden(a.id, a.platform)}
                        className="flex items-center gap-2"
                      >
                        <span
                          role="switch"
                          aria-checked={config.hidden}
                          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                            config.hidden ? "bg-gray-300 dark:bg-gray-600" : "bg-cyan-500"
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                              config.hidden ? "translate-x-0.5" : "translate-x-3.5"
                            }`}
                          />
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            config.hidden
                              ? "text-gray-400 dark:text-gray-500"
                              : "text-cyan-600 dark:text-cyan-400"
                          }`}
                        >
                          {config.hidden ? "Hidden" : "Active"}
                        </span>
                      </button>
                    </td>

                    {/* Actions affordance */}
                    <td className={tdClass}>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(a.key)}
                        className="px-1.5 py-0.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors"
                        title="Assign feed providers"
                      >
                        ⋯
                      </button>
                    </td>
                  </tr>

                  {/* Inline expand: feed provider checklist */}
                  {isExpanded && (
                    <tr className="bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <td colSpan={7} className="px-4 py-3">
                        {feedProviders.length === 0 ? (
                          <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                            No feed providers yet.
                          </p>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">
                              Assign to:
                            </span>
                            {feedProviders.map((fp) => (
                              <label
                                key={fp.id}
                                className="flex items-center gap-1.5 text-xs cursor-pointer text-gray-700 dark:text-gray-300"
                              >
                                <input
                                  type="checkbox"
                                  checked={config.feedProviderIds.includes(fp.id)}
                                  onChange={() => toggleFeedProvider(a.id, fp.id, a.platform)}
                                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-cyan-500 focus:ring-cyan-500"
                                />
                                <span className="truncate max-w-[140px]">{fp.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Shared renderer for the Facebook Pages tables (active + collapsed hidden).
  const renderPagesTable = (list: typeof metaPages) => (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className={`${thClass} w-8`}></th>
              <th className={thClass}>Page</th>
              <th className={thClass}>Business</th>
              <th className={thClass}>Ads</th>
              <th className={thClass}>Feed Providers</th>
              <th className={thClass}>Status</th>
              <th className={`${thClass} w-8`}></th>
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => {
              const cfg = getPageCfg(p.id);
              const { running, limit, remaining } = pageStats(p.id);
              const isExpanded = expandedPageId === p.id;
              const assignedProviders = feedProviders.filter((fp) =>
                cfg.feedProviderIds.includes(fp.id)
              );

              return (
                <Fragment key={p.id}>
                  <tr
                    className={`border-b border-gray-100 dark:border-gray-700 transition-colors ${
                      i % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-gray-800/20"
                    } ${isExpanded ? "border-b-0" : "last:border-0"} hover:bg-gray-50 dark:hover:bg-gray-800/60`}
                  >
                    <td className={tdClass}>
                      <PlatformIcon platform="meta" />
                    </td>

                    {/* Page name + id */}
                    <td className={tdClass}>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate max-w-[220px]">
                          {p.name}
                        </span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate max-w-[220px]">
                          {p.id}
                        </span>
                      </div>
                    </td>

                    {/* Business Manager */}
                    <td className={tdClass}>
                      <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[160px] block">
                        {p.businessName || <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </span>
                    </td>

                    {/* Ads usage bar (running / limit) — matches Business Manager */}
                    <td className={tdClass}>
                      <div className="flex flex-col gap-1 min-w-[150px] max-w-[220px]">
                        <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              remaining > 0 ? "bg-green-500" : "bg-red-500"
                            }`}
                            style={{ width: `${Math.min(100, (running / limit) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 text-center tabular-nums">
                          {running} / {limit}
                        </span>
                      </div>
                    </td>

                    {/* Feed provider chips — click to expand assignment checklist */}
                    <td className={tdClass}>
                      <button
                        type="button"
                        onClick={() => togglePageExpanded(p.id)}
                        className="flex items-center gap-1 flex-wrap max-w-[220px] text-left group"
                      >
                        {assignedProviders.length === 0 ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500 italic group-hover:text-cyan-600 dark:group-hover:text-cyan-400">
                            Assign…
                          </span>
                        ) : (
                          assignedProviders.map((fp) => (
                            <span
                              key={fp.id}
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-700 truncate max-w-[100px]"
                            >
                              {fp.name}
                            </span>
                          ))
                        )}
                        <span className="text-gray-300 dark:text-gray-600 text-[10px]">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </button>
                    </td>

                    {/* Active / Hidden toggle */}
                    <td className={tdClass}>
                      <button
                        type="button"
                        onClick={() => togglePageHidden(p.id)}
                        className="flex items-center gap-2"
                      >
                        <span
                          role="switch"
                          aria-checked={cfg.hidden}
                          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                            cfg.hidden ? "bg-gray-300 dark:bg-gray-600" : "bg-cyan-500"
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                              cfg.hidden ? "translate-x-0.5" : "translate-x-3.5"
                            }`}
                          />
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            cfg.hidden
                              ? "text-gray-400 dark:text-gray-500"
                              : "text-cyan-600 dark:text-cyan-400"
                          }`}
                        >
                          {cfg.hidden ? "Hidden" : "Active"}
                        </span>
                      </button>
                    </td>

                    {/* Actions affordance */}
                    <td className={tdClass}>
                      <button
                        type="button"
                        onClick={() => togglePageExpanded(p.id)}
                        className="px-1.5 py-0.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors"
                        title="Assign feed providers"
                      >
                        ⋯
                      </button>
                    </td>
                  </tr>

                  {/* Inline expand: feed provider checklist */}
                  {isExpanded && (
                    <tr className="bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <td colSpan={7} className="px-4 py-3">
                        {feedProviders.length === 0 ? (
                          <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                            No feed providers yet.
                          </p>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">
                              Assign to:
                            </span>
                            {feedProviders.map((fp) => (
                              <label
                                key={fp.id}
                                className="flex items-center gap-1.5 text-xs cursor-pointer text-gray-700 dark:text-gray-300"
                              >
                                <input
                                  type="checkbox"
                                  checked={cfg.feedProviderIds.includes(fp.id)}
                                  onChange={() => togglePageFeedProvider(p.id, fp.id)}
                                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-cyan-500 focus:ring-cyan-500"
                                />
                                <span className="truncate max-w-[140px]">{fp.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Traffic Sources</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage traffic source connections and ad account settings.
        </p>
      </div>

      {/* Section 1: Connected Sources — compact horizontal cards */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">Connected Sources</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Snapchat Card */}
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <SnapchatLogo className="w-9 h-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Snapchat</h3>
                  {authLoading ? (
                    <span className="text-xs text-gray-400 dark:text-gray-500">Checking…</span>
                  ) : snapConnected ? (
                    <Badge variant="green">Connected</Badge>
                  ) : (
                    <Badge variant="gray">Not connected</Badge>
                  )}
                </div>
              </div>
              {!authLoading && (
                <div className="shrink-0">
                  {snapConnected ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                      onClick={handleDisconnectSnap}
                      disabled={disconnecting}
                    >
                      {disconnecting ? "Disconnecting…" : "Disconnect"}
                    </Button>
                  ) : (
                    <a
                      href="/api/auth/snapchat/connect"
                      className="inline-flex items-center justify-center py-1.5 px-3 bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-semibold rounded-lg transition-colors text-sm"
                    >
                      Connect
                    </a>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Meta (Facebook) Card */}
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                <MetaLogo className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Meta</h3>
                  {authLoading ? (
                    <span className="text-xs text-gray-400 dark:text-gray-500">Checking…</span>
                  ) : metaConnected ? (
                    <Badge variant="green">Connected</Badge>
                  ) : (
                    <Badge variant="gray">Not connected</Badge>
                  )}
                </div>
              </div>
              {!authLoading && (
                <div className="shrink-0">
                  {metaConnected ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                      onClick={handleDisconnectMeta}
                      disabled={metaDisconnecting}
                    >
                      {metaDisconnecting ? "Disconnecting…" : "Disconnect"}
                    </Button>
                  ) : (
                    <a
                      href="/api/auth/meta/connect"
                      className="inline-flex items-center justify-center py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors text-sm"
                    >
                      Connect
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Token expiry warning — Meta tokens last ~60 days with no refresh */}
            {metaConnected && metaTokenDaysLeft !== null && metaTokenDaysLeft <= 7 && (
              <p
                className={`text-xs px-2 py-1 rounded mt-3 ${
                  metaTokenDaysLeft <= 0
                    ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                    : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                }`}
              >
                {metaTokenDaysLeft <= 0
                  ? "Token expired — reconnect to restore access."
                  : `Token expires in ${metaTokenDaysLeft} day${metaTokenDaysLeft === 1 ? "" : "s"} — reconnect soon.`}
              </p>
            )}
          </Card>
        </div>
      </section>

      {/* Section 2: Unified Ad Accounts table (Snap + Meta) — active only, hidden collapsed below */}
      {accountsSectionVisible && (
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Ad Accounts</h2>
            <div className="flex items-center gap-2">
              <input
                type="search"
                placeholder="Search accounts…"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                {(["all", "snap", "meta"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatformFilter(p)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      platformFilter === p
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    {p === "all" ? "All" : p === "snap" ? "Snap" : "Meta"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {accountsSectionLoading ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <Spinner /> Loading accounts…
            </div>
          ) : unifiedAccounts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No ad accounts found. Make sure your account has Business Manager access.
            </p>
          ) : (
            <>
              {activeAccounts.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    {filteredAccounts.length === 0
                      ? "No accounts match your search."
                      : "No active accounts — all matching accounts are hidden."}
                  </p>
                </div>
              ) : (
                renderAccountsTable(activeAccounts)
              )}

              {/* Hidden accounts — collapsed by default */}
              {hiddenTotal > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowHidden((v) => !v)}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <span className="text-gray-400 dark:text-gray-500 text-xs">{showHidden ? "▼" : "▶"}</span>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Hidden accounts</span>
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {hiddenTotal}
                    </span>
                    <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">
                      {showHidden ? "Hide" : "Show"}
                    </span>
                  </button>

                  {showHidden && (
                    <div className="mt-2 opacity-80">
                      {hiddenAccounts.length === 0 ? (
                        <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-center">
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            No hidden accounts match your search.
                          </p>
                        </div>
                      ) : (
                        renderAccountsTable(hiddenAccounts)
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Section: Facebook Pages (ad-limit aware) */}
      {metaConnected && (
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Facebook Pages</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Ads publish from the assigned page with the most ads remaining. Counts cached ~10 min.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="search"
                placeholder="Search pages…"
                value={pageSearch}
                onChange={(e) => setPageSearch(e.target.value)}
                className="border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
              <button
                type="button"
                onClick={handleRefreshPages}
                disabled={refreshingPages}
                title="Fetch the latest ad counts from Meta (bypasses the 10-min cache)"
                className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {refreshingPages ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>
          </div>

          {pagesLoading ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
              <Spinner /> Loading pages…
            </div>
          ) : metaPages.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No Facebook Pages found. Make sure your Meta account manages at least one Page.
            </p>
          ) : (
            <>
              {activePages.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    {filteredPages.length === 0
                      ? "No pages match your search."
                      : "No active pages — all matching pages are hidden."}
                  </p>
                </div>
              ) : (
                renderPagesTable(activePages)
              )}

              {/* Hidden pages — collapsed by default */}
              {hiddenPagesTotal > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowHiddenPages((v) => !v)}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <span className="text-gray-400 dark:text-gray-500 text-xs">{showHiddenPages ? "▼" : "▶"}</span>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Hidden pages</span>
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {hiddenPagesTotal}
                    </span>
                    <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">
                      {showHiddenPages ? "Hide" : "Show"}
                    </span>
                  </button>

                  {showHiddenPages && (
                    <div className="mt-2 opacity-80">
                      {hiddenPages.length === 0 ? (
                        <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 text-center">
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            No hidden pages match your search.
                          </p>
                        </div>
                      ) : (
                        renderPagesTable(hiddenPages)
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Section 3: Snap Pixels — compact table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Snap Pixels</h2>
          <Button size="sm" onClick={() => router.push("/dashboard/pixels/new")}>
            + Add Pixel
          </Button>
        </div>

        {pixels.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">No pixels saved yet.</p>
            <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard/pixels/new")}>
              Add your first pixel
            </Button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className={thClass}>Name</th>
                    <th className={thClass}>Pixel ID</th>
                    <th className={thClass}>Used By</th>
                    <th className={`${thClass} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pixels.map((pixel, i) => {
                    const assignedProviders = feedProviders.filter((fp) =>
                      fp.snapConfig?.allowedPixelIds?.includes(pixel.id)
                    );
                    return (
                      <tr
                        key={pixel.id}
                        className={`border-b border-gray-100 dark:border-gray-700 last:border-0 ${
                          i % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-gray-800/20"
                        } hover:bg-gray-50 dark:hover:bg-gray-800/60`}
                      >
                        <td className={tdClass}>
                          <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{pixel.name}</span>
                        </td>
                        <td className={tdClass}>
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{pixel.pixelId}</span>
                        </td>
                        <td className={tdClass}>
                          {assignedProviders.length === 0 ? (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {assignedProviders.map((fp) => (
                                <span
                                  key={fp.id}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                >
                                  {fp.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className={tdClass}>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => router.push(`/dashboard/pixels/${pixel.id}/edit`)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                              onClick={() => handleDeletePixel(pixel.id, pixel.name)}
                            >
                              Delete
                            </Button>
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
      </section>

      {/* Section 4: Meta Pixels — compact table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Meta Pixels</h2>
          <Button size="sm" onClick={() => router.push("/dashboard/meta-pixels/new")}>
            + Add Pixel
          </Button>
        </div>

        {metaPixels.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">No Meta pixels saved yet.</p>
            <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard/meta-pixels/new")}>
              Add your first Meta pixel
            </Button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className={thClass}>Name</th>
                    <th className={thClass}>Pixel ID</th>
                    <th className={thClass}>Used By</th>
                    <th className={`${thClass} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {metaPixels.map((pixel, i) => {
                    const assignedProviders = feedProviders.filter((fp) =>
                      fp.metaConfig?.allowedPixelIds?.includes(pixel.id)
                    );
                    return (
                      <tr
                        key={pixel.id}
                        className={`border-b border-gray-100 dark:border-gray-700 last:border-0 ${
                          i % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-gray-800/20"
                        } hover:bg-gray-50 dark:hover:bg-gray-800/60`}
                      >
                        <td className={tdClass}>
                          <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{pixel.name}</span>
                        </td>
                        <td className={tdClass}>
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{pixel.pixelId}</span>
                        </td>
                        <td className={tdClass}>
                          {assignedProviders.length === 0 ? (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {assignedProviders.map((fp) => (
                                <span
                                  key={fp.id}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                >
                                  {fp.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className={tdClass}>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => router.push(`/dashboard/meta-pixels/${pixel.id}/edit`)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                              onClick={() => handleDeleteMetaPixel(pixel.id, pixel.name)}
                            >
                              Delete
                            </Button>
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
      </section>
    </div>
  );
}
