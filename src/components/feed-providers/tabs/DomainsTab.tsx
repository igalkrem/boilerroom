"use client";

import { v4 as uuid } from "uuid";
import type { FeedProviderDomain } from "@/types/feed-provider";

const ALL_SOURCES: Array<{ value: string; label: string }> = [
  { value: "Snap", label: "Snap" },
  { value: "Meta", label: "Facebook" },
];

interface DomainsTabProps {
  domains: FeedProviderDomain[]; // full shared list
  onChange: (domains: FeedProviderDomain[]) => void;
  trafficSource: "Snap" | "Meta"; // this tab's source — only domains tagged for it are shown
}

export function DomainsTab({ domains, onChange, trafficSource }: DomainsTabProps) {
  const visible = domains.filter((d) => (d.trafficSources ?? ["Snap"]).includes(trafficSource));

  function addDomain() {
    onChange([...domains, { id: uuid(), baseDomain: "", baseUrl: "", trafficSources: [trafficSource] }]);
  }

  // Untag from this source; drop the domain entirely if no sources remain.
  function removeDomain(id: string) {
    onChange(
      domains.flatMap((d) => {
        if (d.id !== id) return [d];
        const next = (d.trafficSources ?? []).filter((s) => s !== trafficSource);
        return next.length > 0 ? [{ ...d, trafficSources: next }] : [];
      })
    );
  }

  function updateDomain(id: string, patch: Partial<FeedProviderDomain>) {
    onChange(domains.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function toggleSource(domain: FeedProviderDomain, source: string) {
    const current = domain.trafficSources ?? [];
    const next = current.includes(source)
      ? current.filter((s) => s !== source)
      : [...current, source];
    // Never let a visible row lose its current tab's source via the chip toggle —
    // use ✕ to remove instead. Guard keeps at least this source when toggling it off.
    if (source === trafficSource && !next.includes(trafficSource)) return;
    updateDomain(domain.id, { trafficSources: next });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Domains used for {trafficSource === "Meta" ? "Facebook" : "Snap"} traffic. A domain can be shared with the other source via its chips.
        </p>
        <button
          type="button"
          onClick={addDomain}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          + Add domain
        </button>
      </div>

      {visible.length === 0 && (
        <div className="border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center text-sm text-gray-400">
          No domains for this traffic source. Click &quot;+ Add domain&quot; to get started.
        </div>
      )}

      <div className="space-y-2">
        {visible.map((domain) => (
          <div key={domain.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="example.com"
                value={domain.baseDomain}
                onChange={(e) => updateDomain(domain.id, { baseDomain: e.target.value })}
                className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <div className="flex gap-2 shrink-0">
                {ALL_SOURCES.map((src) => (
                  <label key={src.value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(domain.trafficSources ?? []).includes(src.value)}
                      onChange={() => toggleSource(domain, src.value)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-300">{src.label}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => removeDomain(domain.id)}
                className="text-gray-300 hover:text-red-500 shrink-0"
                title="Remove from this traffic source"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              placeholder="Base URL (e.g. https://example.com/lp)"
              value={domain.baseUrl ?? ""}
              onChange={(e) => updateDomain(domain.id, { baseUrl: e.target.value || undefined })}
              className="w-full px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
