"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadAdAccountConfigs } from "@/lib/adAccounts";
import type { FeedProvider, FeedProviderDomain, UrlConfig, ChannelConfig } from "@/types/feed-provider";
import { loadPixels } from "@/lib/pixels";
import { UrlParametersTab } from "./UrlParametersTab";
import { ChannelsTab } from "./ChannelsTab";
import { DomainsTab } from "./DomainsTab";
import { NamingTemplateEditor } from "../NamingTemplateEditor";

interface SnapTabProps {
  snapConfig: FeedProvider["snapConfig"];
  onChange: (config: FeedProvider["snapConfig"]) => void;
  domains: FeedProviderDomain[];
  onDomainsChange: (domains: FeedProviderDomain[]) => void;
  feedProviderId: string | null;
}

export function SnapTab({ snapConfig, onChange, domains, onDomainsChange, feedProviderId }: SnapTabProps) {
  const [assignedAccountNames, setAssignedAccountNames] = useState<Array<{ id: string; name: string }>>([]);
  const [pixelOptions, setPixelOptions] = useState<Array<{ id: string; name: string; pixelId: string }>>([]);

  useEffect(() => {
    setPixelOptions(loadPixels().map((p) => ({ id: p.id, name: p.name, pixelId: p.pixelId })));

    const configs = loadAdAccountConfigs();
    const assigned = configs
      .filter((c) => snapConfig.allowedAdAccountIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    const configIds = new Set(configs.map((c) => c.id));
    const unknownIds = snapConfig.allowedAdAccountIds
      .filter((id) => !configIds.has(id))
      .map((id) => ({ id, name: id }));
    setAssignedAccountNames([...assigned, ...unknownIds]);
  }, [snapConfig.allowedAdAccountIds]);

  function togglePixel(id: string) {
    const current = snapConfig.allowedPixelIds;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onChange({ ...snapConfig, allowedPixelIds: next });
  }

  const namingTemplate = snapConfig.campaignNamingTemplate ?? [];
  const urlConfig: UrlConfig = snapConfig.urlConfig ?? { baseUrl: "", parameters: [] };
  const channelConfig: ChannelConfig = snapConfig.channelConfig ?? { type: "parameter-based" };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Revenue Source</p>
        <div className="flex gap-2">
          {(["visymo", "predicto", "none"] as const).map((val) => {
            const typed = val === "none" ? undefined : val;
            const isSelected = (snapConfig.revenueSource ?? "none") === val;
            const label = val === "visymo" ? "Visymo" : val === "predicto" ? "Predicto" : "Not set";
            return (
              <button
                key={val}
                type="button"
                onClick={() => onChange({ ...snapConfig, revenueSource: typed })}
                className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${
                  isSelected
                    ? "bg-cyan-600 border-cyan-600 text-white"
                    : "bg-transparent border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-cyan-400 dark:hover:border-cyan-500"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Routes hourly syncs — Visymo accounts sync at :15, Predicto at :46.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Assigned Ad Accounts</p>
          <Link href="/dashboard/traffic-sources" className="text-xs text-cyan-600 hover:text-cyan-700 underline">
            Manage in Traffic Sources →
          </Link>
        </div>
        {assignedAccountNames.length === 0 ? (
          <p className="text-xs text-gray-400">
            No ad accounts assigned yet.{" "}
            <Link href="/dashboard/traffic-sources" className="text-cyan-600 hover:underline">
              Assign accounts in Traffic Sources.
            </Link>
          </p>
        ) : (
          <div className="space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
            {assignedAccountNames.map((acc) => (
              <div key={acc.id} className="flex items-center gap-2 px-1.5 py-1">
                <span className="w-2 h-2 rounded-full bg-cyan-500 shrink-0" />
                <span className="text-sm text-gray-800 dark:text-gray-200">{acc.name}</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">{acc.id.slice(0, 8)}…</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Allowed Pixels</p>
        {pixelOptions.length === 0 ? (
          <p className="text-xs text-gray-400">
            No pixels saved.{" "}
            <Link href="/dashboard/traffic-sources" className="text-blue-500 hover:underline">
              Add pixels in Traffic Sources.
            </Link>
          </p>
        ) : (
          <div className="space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg p-2">
            {pixelOptions.map((px) => (
              <label key={px.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={snapConfig.allowedPixelIds.includes(px.id)}
                  onChange={() => togglePixel(px.id)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-800 dark:text-gray-200">{px.name}</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">{px.pixelId.slice(0, 10)}…</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">URL Parameters</h3>
        <UrlParametersTab
          urlConfig={urlConfig}
          onChange={(c) => onChange({ ...snapConfig, urlConfig: c })}
          hideBaseUrl
          platform="snap"
        />
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Campaign Naming Template */}
      <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-400">Campaign Naming Template</h3>
        </div>
        <p className="text-xs text-violet-600 dark:text-violet-400">
          Defines how campaign, ad set, and ad names are generated for Snap campaigns under this provider.
          Segments are joined with{" "}
          <code className="bg-white px-1 rounded border border-violet-100 font-mono"> | </code>.
          Overrides the global template in Review &amp; Launch.
        </p>
        <NamingTemplateEditor
          segments={namingTemplate}
          onChange={(t) => onChange({ ...snapConfig, campaignNamingTemplate: t })}
          theme="violet"
        />
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Channels</h3>
        <ChannelsTab
          feedProviderId={feedProviderId}
          channelConfig={channelConfig}
          onChange={(c) => onChange({ ...snapConfig, channelConfig: c })}
          trafficSource="Snap"
        />
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Domains</h3>
        <DomainsTab domains={domains} onChange={onDomainsChange} trafficSource="Snap" />
      </div>
    </div>
  );
}
