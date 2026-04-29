"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui";
import { loadAdAccountConfigs } from "@/lib/adAccounts";
import type { FeedProvider } from "@/types/feed-provider";
import { loadPixels } from "@/lib/pixels";
import { UrlParametersTab } from "./UrlParametersTab";

interface SnapTabProps {
  snapConfig: FeedProvider["snapConfig"];
  onChange: (config: FeedProvider["snapConfig"]) => void;
  urlConfig: FeedProvider["urlConfig"];
  onUrlConfigChange: (config: FeedProvider["urlConfig"]) => void;
}

export function SnapTab({ snapConfig, onChange, urlConfig, onUrlConfigChange }: SnapTabProps) {
  const [assignedAccountNames, setAssignedAccountNames] = useState<Array<{ id: string; name: string }>>([]);
  const [pixelOptions, setPixelOptions] = useState<Array<{ id: string; name: string; pixelId: string }>>([]);

  useEffect(() => {
    setPixelOptions(loadPixels().map((p) => ({ id: p.id, name: p.name, pixelId: p.pixelId })));

    // Show accounts assigned to this provider (managed from Traffic Sources)
    const configs = loadAdAccountConfigs();
    const assigned = configs
      .filter((c) => snapConfig.allowedAdAccountIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    // Also show IDs that don't have a config entry yet (fallback)
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

  return (
    <div className="space-y-6">
      <div>
        <Input
          label="Snapchat Organization ID"
          placeholder="e.g. 0a1b2c3d-..."
          value={snapConfig.organizationId ?? ""}
          onChange={(e) => onChange({ ...snapConfig, organizationId: e.target.value })}
        />
        <p className="text-xs text-gray-400 mt-1">
          Found in Snapchat Business Manager → Organization Settings. Resolves{" "}
          <code className="bg-gray-100 px-1 rounded">{"{{organization_id}}"}</code> in URL templates.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">Assigned Ad Accounts</p>
          <Link
            href="/dashboard/traffic-sources"
            className="text-xs text-cyan-600 hover:text-cyan-700 underline"
          >
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
          <div className="space-y-1 border border-gray-200 rounded-lg p-2 bg-gray-50">
            {assignedAccountNames.map((acc) => (
              <div key={acc.id} className="flex items-center gap-2 px-1.5 py-1">
                <span className="w-2 h-2 rounded-full bg-cyan-500 shrink-0" />
                <span className="text-sm text-gray-800">{acc.name}</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">{acc.id.slice(0, 8)}…</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Allowed Pixels</p>
        {pixelOptions.length === 0 ? (
          <p className="text-xs text-gray-400">
            No pixels saved.{" "}
            <Link href="/dashboard/traffic-sources" className="text-blue-500 hover:underline">
              Add pixels in Traffic Sources.
            </Link>
          </p>
        ) : (
          <div className="space-y-1 border border-gray-200 rounded-lg p-2">
            {pixelOptions.map((px) => (
              <label key={px.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={snapConfig.allowedPixelIds.includes(px.id)}
                  onChange={() => togglePixel(px.id)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-800">{px.name}</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">{px.pixelId.slice(0, 10)}…</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <hr className="border-gray-100" />

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">URL Parameters</h3>
        <UrlParametersTab
          urlConfig={urlConfig}
          onChange={onUrlConfigChange}
          hideBaseUrl
        />
      </div>
    </div>
  );
}
