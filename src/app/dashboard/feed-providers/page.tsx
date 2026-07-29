"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { loadFeedProviders, deleteFeedProvider, getFeedProviderBadgeClasses, getFeedProviderWashClasses } from "@/lib/feed-providers";
import type { FeedProvider } from "@/types/feed-provider";
import { FeedProviderModal } from "@/components/feed-providers/FeedProviderModal";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function DataRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">
        {label}
      </span>
      <div className="text-xs text-gray-700 dark:text-gray-300 truncate">{value}</div>
    </div>
  );
}

function PlatformChip({ platform }: { platform: "snap" | "meta" }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400">
      <span
        className={`w-3 h-3 rounded flex items-center justify-center text-[7px] font-extrabold leading-none ${
          platform === "meta" ? "bg-blue-600 text-white" : "bg-yellow-300 text-yellow-900"
        }`}
      >
        {platform === "meta" ? "f" : "S"}
      </span>
      {platform === "meta" ? "Meta" : "Snap"}
    </span>
  );
}

function ProviderCard({
  provider,
  onEdit,
  onDelete,
}: {
  provider: FeedProvider;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const firstDomain =
    provider.domains[0]?.baseDomain ??
    provider.snapConfig.urlConfig?.baseUrl ??
    provider.urlConfig?.baseUrl ??
    "";
  const displayUrl = firstDomain.replace(/^https?:\/\//, "");
  const channelType = provider.snapConfig.channelConfig?.type ?? provider.channelConfig?.type;

  const meta = provider.metaConfig;
  const hasMeta = !!(
    meta &&
    (meta.allowedAdAccountIds.length > 0 ||
      meta.allowedPixelIds.length > 0 ||
      (meta.allowedPageIds?.length ?? 0) > 0 ||
      meta.urlConfig?.baseUrl)
  );
  const pixelCount = provider.snapConfig.allowedPixelIds.length + (meta?.allowedPixelIds.length ?? 0);
  const badgeClasses = getFeedProviderBadgeClasses(provider.name);
  const washClasses = getFeedProviderWashClasses(provider.name);

  return (
    <div
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm flex flex-col cursor-pointer hover:border-gray-300 hover:shadow-md transition-all"
      onClick={onEdit}
    >
      {/* Header */}
      <div className={`px-4 pt-4 pb-3 flex items-start justify-between gap-2 border-b border-gray-100 dark:border-gray-700 ${washClasses}`}>
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug truncate">
            {provider.name}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Added {formatDate(provider.createdAt)}</p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            channelType === "provider-supplied"
              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
              : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600"
          }`}
        >
          {channelType === "provider-supplied" ? "Channel list" : "Param-based"}
        </span>
      </div>

      {/* Feed color + platform row */}
      <div className="px-4 pt-2.5 pb-2.5 flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium border truncate max-w-[140px] ${badgeClasses}`}>
          {provider.name}
        </span>
        <div className="flex items-center gap-1">
          <PlatformChip platform="snap" />
          {hasMeta && <PlatformChip platform="meta" />}
        </div>
      </div>

      {/* Data grid */}
      <div className="px-4 pt-3 pb-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <DataRow
          label="Accounts"
          value={provider.snapConfig.allowedAdAccountIds.length + (meta?.allowedAdAccountIds.length ?? 0) || "—"}
        />
        <DataRow
          label="Domains"
          value={provider.domains.length || "—"}
        />
        <DataRow label="Pixels" value={pixelCount || "—"} />
        {displayUrl && (
          <DataRow label="Base URL" value={displayUrl} />
        )}
      </div>

      {/* Actions */}
      <div
        className="mt-auto px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700 flex gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Button size="sm" variant="secondary" className="flex-1" onClick={onEdit}>
          Configure
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 text-red-600 hover:text-red-700"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

export default function FeedProvidersPage() {
  const [providers, setProviders] = useState<FeedProvider[]>([]);
  const [modalProvider, setModalProvider] = useState<FeedProvider | null | "new">(null);

  function reload() {
    setProviders(loadFeedProviders());
  }

  useEffect(() => {
    reload();
  }, []);

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete feed provider "${name}"?`)) return;
    deleteFeedProvider(id);
    reload();
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Feed Providers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure sell-side providers — pixels, URL templates, channels, and domains.
          </p>
        </div>
        <Button onClick={() => setModalProvider("new")}>+ New Feed Provider</Button>
      </div>

      {providers.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-500 text-sm">No feed providers configured yet.</p>
          <Button variant="secondary" onClick={() => setModalProvider("new")}>
            Add your first feed provider
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              onEdit={() => setModalProvider(p)}
              onDelete={() => handleDelete(p.id, p.name)}
            />
          ))}
        </div>
      )}

      {modalProvider !== null && (
        <FeedProviderModal
          provider={modalProvider === "new" ? null : modalProvider}
          onClose={() => setModalProvider(null)}
          onSaved={() => { reload(); setModalProvider(null); }}
        />
      )}
    </div>
  );
}
