"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FeedProvider, FeedProviderDomain, UrlConfig, ChannelConfig } from "@/types/feed-provider";
import { loadAdAccountConfigs } from "@/lib/adAccounts";
import { loadMetaPixels } from "@/lib/meta-pixels";
import { UrlParametersTab } from "./UrlParametersTab";
import { ChannelsTab } from "./ChannelsTab";
import { DomainsTab } from "./DomainsTab";
import { NamingTemplateEditor } from "../NamingTemplateEditor";

type MetaConfig = NonNullable<FeedProvider["metaConfig"]>;

interface MetaTabProps {
  metaConfig: MetaConfig;
  onChange: (config: MetaConfig) => void;
  domains: FeedProviderDomain[];
  onDomainsChange: (domains: FeedProviderDomain[]) => void;
  feedProviderId: string | null;
}

export function MetaTab({ metaConfig, onChange, domains, onDomainsChange, feedProviderId }: MetaTabProps) {
  const [assignedAccountNames, setAssignedAccountNames] = useState<Array<{ id: string; name: string }>>([]);
  const [pageNames, setPageNames] = useState<Record<string, string>>({});
  const [pixelOptions, setPixelOptions] = useState<Array<{ id: string; name: string; pixelId: string }>>([]);

  useEffect(() => {
    setPixelOptions(loadMetaPixels().map((p) => ({ id: p.id, name: p.name, pixelId: p.pixelId })));
    const configs = loadAdAccountConfigs();
    const assigned = configs
      .filter((c) => metaConfig.allowedAdAccountIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    const configIds = new Set(configs.map((c) => c.id));
    const unknownIds = metaConfig.allowedAdAccountIds
      .filter((id) => !configIds.has(id))
      .map((id) => ({ id, name: id }));
    setAssignedAccountNames([...assigned, ...unknownIds]);
  }, [metaConfig.allowedAdAccountIds]);

  // Resolve page IDs → names via the ad-limits feed (same source as Traffic Sources).
  useEffect(() => {
    fetch("/api/meta/ad-limits")
      .then((r) => (r.ok ? r.json() : { pages: [] }))
      .then((data: { pages?: Array<{ pageId: string; name: string }> }) => {
        const map: Record<string, string> = {};
        for (const p of data.pages ?? []) map[p.pageId] = p.name;
        setPageNames(map);
      })
      .catch(() => setPageNames({}));
  }, []);

  function togglePixel(id: string) {
    const current = metaConfig.allowedPixelIds;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onChange({ ...metaConfig, allowedPixelIds: next });
  }

  const namingTemplate = metaConfig.campaignNamingTemplate ?? [];
  const urlConfig: UrlConfig = metaConfig.urlConfig ?? { baseUrl: "", parameters: [] };
  const channelConfig: ChannelConfig = metaConfig.channelConfig ?? { type: "parameter-based" };

  const assignedPageIds =
    metaConfig.allowedPageIds && metaConfig.allowedPageIds.length > 0
      ? metaConfig.allowedPageIds
      : metaConfig.pageId
      ? [metaConfig.pageId]
      : [];

  return (
    <div className="space-y-6">
      {/* Revenue Source */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Revenue Source</p>
        <div className="flex gap-2">
          {(["predicto_fb", "visymo", "none"] as const).map((val) => {
            const typed = val === "none" ? undefined : val;
            const isSelected = (metaConfig.revenueSource ?? "none") === val;
            const label = val === "predicto_fb" ? "Predicto FB" : val === "visymo" ? "Visymo" : "Not set";
            return (
              <button
                key={val}
                type="button"
                onClick={() => onChange({ ...metaConfig, revenueSource: typed })}
                className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${
                  isSelected
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-transparent border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 dark:hover:border-blue-500"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Sell-side revenue for Facebook traffic. Predicto FB joins by channel; Visymo joins by ad set ID.
        </p>
      </div>

      {/* Assigned Ad Accounts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Assigned Meta Ad Accounts</p>
          <Link href="/dashboard/traffic-sources" className="text-xs text-blue-600 hover:text-blue-700 underline">
            Manage in Traffic Sources →
          </Link>
        </div>
        {assignedAccountNames.length === 0 ? (
          <p className="text-xs text-gray-400">
            No Meta ad accounts assigned yet.{" "}
            <Link href="/dashboard/traffic-sources" className="text-blue-600 hover:underline">
              Assign accounts in Traffic Sources.
            </Link>
          </p>
        ) : (
          <div className="space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
            {assignedAccountNames.map((acc) => (
              <div key={acc.id} className="flex items-center gap-2 px-1.5 py-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="text-sm text-gray-800 dark:text-gray-200">{acc.name}</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">{acc.id.slice(0, 12)}…</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Allowed Pixels (Meta) */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Allowed Pixels</p>
        {pixelOptions.length === 0 ? (
          <p className="text-xs text-gray-400">
            No Meta pixels saved.{" "}
            <Link href="/dashboard/traffic-sources" className="text-blue-500 hover:underline">
              Add Meta pixels in Traffic Sources.
            </Link>
          </p>
        ) : (
          <div className="space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg p-2">
            {pixelOptions.map((px) => (
              <label key={px.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={metaConfig.allowedPixelIds.includes(px.id)}
                  onChange={() => togglePixel(px.id)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-800 dark:text-gray-200">{px.name}</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">{px.pixelId.slice(0, 12)}…</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Facebook Pages (assigned in Traffic Sources) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Associated Facebook Pages</p>
          <Link href="/dashboard/traffic-sources" className="text-xs text-blue-600 hover:text-blue-700 underline">
            Manage in Traffic Sources →
          </Link>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Ads publish from the assigned page with the most ads remaining.
        </p>
        {assignedPageIds.length === 0 ? (
          <p className="text-xs text-gray-400">
            No pages assigned yet.{" "}
            <Link href="/dashboard/traffic-sources" className="text-blue-600 hover:underline">
              Assign pages in Traffic Sources.
            </Link>
          </p>
        ) : (
          <div className="space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
            {assignedPageIds.map((pid) => (
              <div key={pid} className="flex items-center gap-2 px-1.5 py-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="text-sm text-gray-800 dark:text-gray-200">{pageNames[pid] ?? pid}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* URL Parameters */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">URL Parameters</h3>
        <UrlParametersTab
          urlConfig={urlConfig}
          onChange={(c) => onChange({ ...metaConfig, urlConfig: c })}
          hideBaseUrl
          platform="meta"
        />
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Campaign Naming Template */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-400">Campaign Naming Template</h3>
        </div>
        <p className="text-xs text-blue-600 dark:text-blue-400">
          Defines how campaign and ad set names are generated for Meta campaigns under this provider.
          Segments are joined with{" "}
          <code className="bg-white px-1 rounded border border-blue-100 font-mono"> | </code>.
        </p>
        <NamingTemplateEditor
          segments={namingTemplate}
          onChange={(t) => onChange({ ...metaConfig, campaignNamingTemplate: t })}
          theme="blue"
        />
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Channels (Meta pool) */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Channels</h3>
        <ChannelsTab
          feedProviderId={feedProviderId}
          channelConfig={channelConfig}
          onChange={(c) => onChange({ ...metaConfig, channelConfig: c })}
          trafficSource="Meta"
        />
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Domains (Meta-tagged) */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Domains</h3>
        <DomainsTab domains={domains} onChange={onDomainsChange} trafficSource="Meta" />
      </div>
    </div>
  );
}
