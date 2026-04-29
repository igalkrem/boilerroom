"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
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

function ProviderCard({
  provider,
  onEdit,
  onDelete,
}: {
  provider: FeedProvider;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow" onClick={onEdit}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900 text-base leading-snug">{provider.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">Added {formatDate(provider.createdAt)}</p>
        </div>
        <span
          className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${
            provider.channelConfig.type === "provider-supplied"
              ? "bg-orange-50 text-orange-700 border-orange-200"
              : "bg-gray-50 text-gray-500 border-gray-200"
          }`}
        >
          {provider.channelConfig.type === "provider-supplied" ? "Channel list" : "Param-based"}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {provider.snapConfig.allowedAdAccountIds.length > 0 && (
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded">
            {provider.snapConfig.allowedAdAccountIds.length} ad account{provider.snapConfig.allowedAdAccountIds.length !== 1 ? "s" : ""}
          </span>
        )}
        {provider.combos.length > 0 && (
          <span className="text-xs bg-purple-50 text-purple-600 border border-purple-100 px-1.5 py-0.5 rounded">
            {provider.combos.length} combo{provider.combos.length !== 1 ? "s" : ""}
          </span>
        )}
        {provider.domains.length > 0 && (
          <span className="text-xs bg-green-50 text-green-600 border border-green-100 px-1.5 py-0.5 rounded">
            {provider.domains.length} domain{provider.domains.length !== 1 ? "s" : ""}
          </span>
        )}
        {provider.urlConfig.baseUrl && (
          <span className="text-xs bg-gray-50 text-gray-500 border border-gray-100 px-1.5 py-0.5 rounded font-mono truncate max-w-[160px]">
            {provider.urlConfig.baseUrl.replace(/^https?:\/\//, "")}
          </span>
        )}
      </div>

      <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
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
    </Card>
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
          <h1 className="text-2xl font-bold text-gray-900">Feed Providers</h1>
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
