"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { loadFeedProviders, deleteFeedProvider } from "@/lib/feed-providers";
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
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-20 shrink-0">
        {label}
      </span>
      <span className="text-xs text-gray-700 truncate">{value}</span>
    </div>
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
  const firstDomain = provider.domains[0]?.baseDomain ?? provider.urlConfig.baseUrl ?? "";
  const displayUrl = firstDomain.replace(/^https?:\/\//, "");

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col cursor-pointer hover:border-gray-300 hover:shadow-md transition-all"
      onClick={onEdit}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 text-sm leading-snug truncate">
            {provider.name}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Added {formatDate(provider.createdAt)}</p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            provider.channelConfig.type === "provider-supplied"
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-gray-50 text-gray-500 border-gray-200"
          }`}
        >
          {provider.channelConfig.type === "provider-supplied" ? "Channel list" : "Param-based"}
        </span>
      </div>

      {/* Data grid */}
      <div className="px-4 pb-3 space-y-1.5">
        <DataRow
          label="Accounts"
          value={provider.snapConfig.allowedAdAccountIds.length || "—"}
        />
        <DataRow
          label="Domains"
          value={provider.domains.length || "—"}
        />
        <DataRow
          label="Combos"
          value={provider.combos.length || "—"}
        />
        {displayUrl && (
          <DataRow label="Base URL" value={displayUrl} />
        )}
      </div>

      {/* Actions */}
      <div
        className="mt-auto px-4 pb-4 pt-2 border-t border-gray-100 flex gap-2"
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Feed Providers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure sell-side providers — pixels, URL templates, channels, domains, and combos.
          </p>
        </div>
        <Button onClick={() => setModalProvider("new")}>+ New Feed Provider</Button>
      </div>

      {providers.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center space-y-3">
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
