"use client";

import { v4 as uuid } from "uuid";
import type { FeedProvider, FeedProviderDomain } from "@/types/feed-provider";

const TRAFFIC_SOURCES = ["Snap"];

interface DomainsTabProps {
  domains: FeedProvider["domains"];
  onChange: (domains: FeedProvider["domains"]) => void;
}

export function DomainsTab({ domains, onChange }: DomainsTabProps) {
  function addDomain() {
    onChange([...domains, { id: uuid(), baseDomain: "", baseUrl: "", trafficSources: ["Snap"] }]);
  }

  function removeDomain(id: string) {
    onChange(domains.filter((d) => d.id !== id));
  }

  function updateDomain(id: string, patch: Partial<FeedProviderDomain>) {
    onChange(domains.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function toggleSource(domain: FeedProviderDomain, source: string) {
    const next = domain.trafficSources.includes(source)
      ? domain.trafficSources.filter((s) => s !== source)
      : [...domain.trafficSources, source];
    updateDomain(domain.id, { trafficSources: next });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Define which domains are used for this provider.</p>
        <button
          type="button"
          onClick={addDomain}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          + Add domain
        </button>
      </div>

      {domains.length === 0 && (
        <div className="border border-dashed border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          No domains configured. Click &quot;+ Add domain&quot; to get started.
        </div>
      )}

      <div className="space-y-2">
        {domains.map((domain) => (
          <div key={domain.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="example.com"
                value={domain.baseDomain}
                onChange={(e) => updateDomain(domain.id, { baseDomain: e.target.value })}
                className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <div className="flex gap-2 shrink-0">
                {TRAFFIC_SOURCES.map((src) => (
                  <label key={src} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={domain.trafficSources.includes(src)}
                      onChange={() => toggleSource(domain, src)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-600">{src}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => removeDomain(domain.id)}
                className="text-gray-300 hover:text-red-500 shrink-0"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              placeholder="Base URL (e.g. https://example.com/lp)"
              value={domain.baseUrl ?? ""}
              onChange={(e) => updateDomain(domain.id, { baseUrl: e.target.value || undefined })}
              className="w-full px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
