"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadPresets, deletePreset, duplicatePreset } from "@/lib/presets";
import { loadFeedProviders } from "@/lib/feed-providers";
import { loadPixels } from "@/lib/pixels";
import type { CampaignPreset, AdSquadPresetData } from "@/types/preset";
import type { FeedProvider } from "@/types/feed-provider";
import type { SavedPixel } from "@/types/pixel";

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs font-medium text-gray-700 truncate">{value}</p>
    </div>
  );
}

function TrafficSourceBadge({ source }: { source: "snap" | "facebook" }) {
  if (source === "facebook") {
    return (
      <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full shrink-0">
        Facebook
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full shrink-0">
      Snap
    </span>
  );
}

function geoText(sq?: AdSquadPresetData): string {
  if (!sq) return "—";
  const legacy = sq as unknown as { geoCountryCodes?: string[]; geoCountryCode?: string };
  const codes = legacy.geoCountryCodes ?? (legacy.geoCountryCode ? [legacy.geoCountryCode] : []);
  return codes.length > 0 ? codes.join(", ") : "Any";
}

function bidText(sq?: AdSquadPresetData): string {
  if (!sq) return "—";
  if (sq.bidStrategy === "AUTO_BID") return "Auto";
  const amt = sq.bidAmountUsd ? `$${sq.bidAmountUsd}` : "";
  if (sq.bidStrategy === "LOWEST_COST_WITH_MAX_BID") return `Max ${amt}`.trim();
  if (sq.bidStrategy === "TARGET_COST") return `Target ${amt}`.trim();
  return sq.bidStrategy;
}

function budgetText(sq?: AdSquadPresetData): string {
  if (!sq || !sq.dailyBudgetUsd) return "—";
  return `$${sq.dailyBudgetUsd}/day`;
}

function deviceText(sq?: AdSquadPresetData): string {
  if (!sq || !sq.targetingDeviceType || sq.targetingDeviceType === "ALL") return "All";
  const labels: Record<string, string> = { MOBILE: "Mobile", WEB: "Web" };
  return labels[sq.targetingDeviceType] ?? sq.targetingDeviceType;
}

export default function PresetsPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<CampaignPreset[]>([]);
  const [providerMap, setProviderMap] = useState<Record<string, FeedProvider>>({});
  const [pixelMap, setPixelMap] = useState<Record<string, SavedPixel>>({});

  useEffect(() => {
    setPresets(loadPresets());
    const providers = loadFeedProviders();
    setProviderMap(Object.fromEntries(providers.map((p) => [p.id, p])));
    const pixels = loadPixels();
    setPixelMap(Object.fromEntries(pixels.map((px) => [px.pixelId, px])));
  }, []);

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete preset "${name}"? This cannot be undone.`)) return;
    deletePreset(id);
    setPresets(loadPresets());
  }

  function handleDuplicate(id: string) {
    duplicatePreset(id);
    setPresets(loadPresets());
  }

  const btnBase = "text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaign Presets</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reusable ad set configurations — select a preset in the wizard canvas.
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard/presets/new")}
          className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-sm font-semibold transition-colors"
        >
          + New Preset
        </button>
      </div>

      {presets.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-500 text-sm">No presets saved yet.</p>
          <button
            onClick={() => router.push("/dashboard/presets/new")}
            className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
          >
            Create your first preset
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {presets.map((preset) => {
            const sq0 = preset.adSquads?.[0];
            const providerName = providerMap[preset.feedProviderId]?.name;
            const pixelName = sq0?.pixelId ? (pixelMap[sq0.pixelId]?.name ?? sq0.pixelId) : "—";

            return (
              <div
                key={preset.id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col"
              >
                {/* Header */}
                <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900 text-sm leading-snug">{preset.name}</h2>
                  <TrafficSourceBadge source={preset.trafficSource ?? "snap"} />
                </div>

                {/* Provider warning */}
                {preset.feedProviderId && !providerMap[preset.feedProviderId] && (
                  <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100">
                    <span className="text-xs text-amber-600">Provider not found</span>
                  </div>
                )}

                {/* Data grid */}
                <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-3 flex-1">
                  <DataRow label="Feed" value={providerName ?? "—"} />
                  <DataRow label="Geo" value={geoText(sq0)} />
                  <DataRow label="Pixel" value={pixelName} />
                  <DataRow label="Bid" value={bidText(sq0)} />
                  <DataRow label="Budget" value={budgetText(sq0)} />
                  <DataRow label="Device" value={deviceText(sq0)} />
                </div>

                {/* Actions */}
                <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/dashboard/presets/${preset.id}/edit`)}
                    className={`${btnBase} border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDuplicate(preset.id)}
                    className={`${btnBase} border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900`}
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleDelete(preset.id, preset.name)}
                    className={`${btnBase} border-red-100 text-red-500 hover:border-red-200 hover:text-red-600 ml-auto`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
