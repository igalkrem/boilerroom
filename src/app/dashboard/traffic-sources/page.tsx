"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSnapchatAuth } from "@/hooks/useSnapchatAuth";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { loadAdAccountConfigs, upsertAdAccountConfig } from "@/lib/adAccounts";
import { loadFeedProviders, upsertFeedProvider } from "@/lib/feed-providers";
import { loadPixels, deletePixel } from "@/lib/pixels";
import { Button, Card, Badge, Spinner } from "@/components/ui";
import type { AdAccountConfig } from "@/types/ad-account";
import type { FeedProvider } from "@/types/feed-provider";
import type { SavedPixel } from "@/types/pixel";

function SnapchatLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.166.002c.83-.005 3.39.229 4.643 2.848.422.88.338 2.352.269 3.562l-.012.2c-.006.09.049.125.106.101.225-.093.456-.24.7-.397.328-.21.664-.426 1.021-.506a1.53 1.53 0 01.379-.024c.498.032.938.346 1.106.785.217.567-.045 1.128-.779 1.663-.118.086-.247.164-.375.241-.403.241-.732.437-.665.671.044.152.19.332.364.553.536.677 1.344 1.7 1.344 3.414 0 2.618-1.83 4.62-4.99 5.544-.193.056-.236.151-.267.27-.046.175-.085.325-.296.484-.271.2-.68.3-1.252.302-.494.002-1.102-.08-1.76-.167-.77-.102-1.566-.209-2.27-.153-.703.055-1.377.22-2.018.379-.548.138-1.072.27-1.572.27h-.049c-.545-.008-.938-.106-1.198-.3-.208-.158-.248-.307-.291-.48-.03-.117-.072-.212-.265-.268C3.83 18.625 2 16.623 2 14.005c0-1.715.808-2.737 1.344-3.414.174-.22.32-.401.364-.553.068-.233-.262-.43-.665-.671a5.39 5.39 0 01-.375-.241C1.934 8.59 1.672 8.03 1.89 7.46c.167-.439.608-.753 1.106-.785a1.51 1.51 0 01.379.024c.357.08.693.296 1.021.506.244.157.475.304.7.397.056.023.112-.011.106-.1l-.012-.201C5.12 6.09 5.037 4.617 5.46 3.736 6.574 1.388 8.91.807 10.316.36 10.83.193 11.444.006 12.166.002z" />
    </svg>
  );
}

export default function TrafficSourcesPage() {
  const router = useRouter();
  const { snapConnected, isLoading: authLoading } = useSnapchatAuth();
  const { accounts: snapAccounts, isLoading: accountsLoading } = useAdAccounts();
  const [adAccountConfigs, setAdAccountConfigs] = useState<AdAccountConfig[]>([]);
  const [feedProviders, setFeedProviders] = useState<FeedProvider[]>([]);
  const [pixels, setPixels] = useState<SavedPixel[]>([]);
  const [disconnecting, setDisconnecting] = useState(false);

  const reloadLocal = useCallback(() => {
    setAdAccountConfigs(loadAdAccountConfigs());
    setFeedProviders(loadFeedProviders());
    setPixels(loadPixels());
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

  const getConfig = (accountId: string): AdAccountConfig => {
    const existing = adAccountConfigs.find((c) => c.id === accountId);
    const account = snapAccounts.find((a) => a.id === accountId);
    return (
      existing ?? {
        id: accountId,
        name: account?.name ?? accountId,
        hidden: false,
        feedProviderIds: [],
        updatedAt: new Date().toISOString(),
      }
    );
  };

  const toggleHidden = (accountId: string) => {
    const config = getConfig(accountId);
    const updated = { ...config, hidden: !config.hidden, updatedAt: new Date().toISOString() };
    upsertAdAccountConfig(updated);
    setAdAccountConfigs(loadAdAccountConfigs());
    // Update feed providers whose allowedAdAccountIds reference this account
    syncFeedProviderAssignments(accountId, updated.feedProviderIds, !config.hidden);
  };

  const toggleFeedProvider = (accountId: string, providerId: string) => {
    const config = getConfig(accountId);
    const alreadyAssigned = config.feedProviderIds.includes(providerId);
    const newProviderIds = alreadyAssigned
      ? config.feedProviderIds.filter((id) => id !== providerId)
      : [...config.feedProviderIds, providerId];
    const updated = { ...config, feedProviderIds: newProviderIds, updatedAt: new Date().toISOString() };
    upsertAdAccountConfig(updated);
    setAdAccountConfigs(loadAdAccountConfigs());
    syncFeedProviderAssignments(accountId, newProviderIds, config.hidden);
  };

  // Sync FeedProvider.snapConfig.allowedAdAccountIds from AdAccountConfig assignments
  const syncFeedProviderAssignments = (
    accountId: string,
    newProviderIds: string[],
    isHidden: boolean
  ) => {
    const allProviders = loadFeedProviders();
    for (const provider of allProviders) {
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
    setFeedProviders(loadFeedProviders());
  };

  const handleDeletePixel = (id: string, name: string) => {
    if (!confirm(`Delete pixel "${name}"? This cannot be undone.`)) return;
    deletePixel(id);
    setPixels(loadPixels());
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Traffic Sources</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage traffic source connections and ad account settings.
        </p>
      </div>

      {/* Section 1: Connected Sources */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Connected Sources</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Snapchat Card */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-400 flex items-center justify-center shrink-0">
                <SnapchatLogo className="w-6 h-6 text-gray-950" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm">Snapchat</h3>
                {authLoading ? (
                  <p className="text-xs text-gray-400">Checking…</p>
                ) : snapConnected ? (
                  <Badge variant="green">Connected</Badge>
                ) : (
                  <Badge variant="gray">Not connected</Badge>
                )}
              </div>
            </div>
            {!authLoading && (
              snapConnected ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:text-red-600 mt-auto"
                  onClick={handleDisconnectSnap}
                  disabled={disconnecting}
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </Button>
              ) : (
                <a
                  href="/api/auth/snapchat/connect"
                  className="block w-full text-center py-1.5 px-3 bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-semibold rounded-lg transition-colors text-sm mt-auto"
                >
                  Connect Snapchat
                </a>
              )
            )}
          </Card>

          {/* Facebook placeholder (future) */}
          <Card className="flex flex-col gap-4 opacity-50 pointer-events-none select-none">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Facebook</h3>
                <span className="text-xs text-gray-400">Coming soon</span>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Section 2: Ad Accounts */}
      {snapConnected && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Ad Accounts</h2>
          {accountsLoading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Spinner /> Loading accounts…
            </div>
          ) : snapAccounts.length === 0 ? (
            <p className="text-sm text-gray-500">
              No Snapchat ad accounts found. Make sure your account has Business Manager access.
            </p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
              {snapAccounts.map((account) => {
                const config = getConfig(account.id);
                return (
                  <div key={account.id} className="p-4 flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{account.name}</span>
                        {config.hidden && (
                          <Badge variant="gray">Hidden</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{account.id}</p>
                    </div>

                    <div className="flex flex-col gap-3 sm:w-64 shrink-0">
                      {/* Hide toggle */}
                      <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
                        <span className="text-gray-600">Hide from campaigns</span>
                        <button
                          role="switch"
                          aria-checked={config.hidden}
                          onClick={() => toggleHidden(account.id)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                            config.hidden ? "bg-gray-400" : "bg-cyan-500"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                              config.hidden ? "translate-x-1" : "translate-x-5"
                            }`}
                          />
                        </button>
                      </label>

                      {/* Feed provider assignment */}
                      {feedProviders.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1.5">Assign to feed providers:</p>
                          <div className="space-y-1">
                            {feedProviders.map((fp) => (
                              <label key={fp.id} className="flex items-center gap-2 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={config.feedProviderIds.includes(fp.id)}
                                  onChange={() => toggleFeedProvider(account.id, fp.id)}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-cyan-500 focus:ring-cyan-500"
                                />
                                <span className="text-gray-700 truncate">{fp.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Section 3: Pixels */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">Snap Pixels</h2>
          <Button size="sm" onClick={() => router.push("/dashboard/pixels/new")}>
            + Add Pixel
          </Button>
        </div>

        {pixels.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
            <p className="text-gray-500 text-sm mb-3">No pixels saved yet.</p>
            <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard/pixels/new")}>
              Add your first pixel
            </Button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {pixels.map((pixel) => {
              const assignedProviders = feedProviders.filter((fp) =>
                fp.snapConfig?.allowedPixelIds?.includes(pixel.id)
              );
              return (
              <div key={pixel.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{pixel.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{pixel.pixelId}</p>
                  {assignedProviders.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Used by:{" "}
                      {assignedProviders.map((fp, i) => (
                        <span key={fp.id}>
                          <span className="font-medium text-gray-700">{fp.name}</span>
                          {i < assignedProviders.length - 1 && ", "}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
                    className="text-red-500 hover:text-red-600"
                    onClick={() => handleDeletePixel(pixel.id, pixel.name)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
