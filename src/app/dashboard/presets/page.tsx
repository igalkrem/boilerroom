"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { loadPresets, deletePreset, duplicatePreset } from "@/lib/presets";
import { loadFeedProviders } from "@/lib/feed-providers";
import { loadPixels } from "@/lib/pixels";
import { loadCountryGroups } from "@/lib/country-groups";
import { CountryGroupsModal } from "@/components/presets/CountryGroupsModal";
import type { CampaignPreset, AdSquadPresetData } from "@/types/preset";
import type { FeedProvider } from "@/types/feed-provider";
import type { SavedPixel } from "@/types/pixel";
import type { CountryGroup } from "@/types/country-group";

function geoText(preset: CampaignPreset, groupMap: Record<string, CountryGroup>): string {
  if (preset.countryGroupId) {
    const group = groupMap[preset.countryGroupId];
    if (group) return `🔗 ${group.name}: ${group.countryCodes.join(", ")}`;
  }
  const sq = preset.adSquads?.[0] as unknown as { geoCountryCodes?: string[]; geoCountryCode?: string } | undefined;
  const codes =
    sq?.geoCountryCodes ??
    (sq?.geoCountryCode ? [sq.geoCountryCode] : undefined) ??
    preset.metaAdSet?.geoCountryCodes ??
    [];
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

interface FeedColumn {
  providerId: string;
  providerName: string;
  providerMissing: boolean;
  snap: CampaignPreset[];
  facebook: CampaignPreset[];
}

function buildFeedColumns(
  presets: CampaignPreset[],
  providerMap: Record<string, FeedProvider>
): FeedColumn[] {
  const columns = new Map<string, FeedColumn>();
  for (const preset of presets) {
    const providerId = preset.feedProviderId || "__none__";
    const provider = preset.feedProviderId ? providerMap[preset.feedProviderId] : undefined;
    if (!columns.has(providerId)) {
      columns.set(providerId, {
        providerId,
        providerName: provider?.name ?? (preset.feedProviderId ? "Unknown feed" : "No feed"),
        providerMissing: Boolean(preset.feedProviderId) && !provider,
        snap: [],
        facebook: [],
      });
    }
    const column = columns.get(providerId)!;
    if ((preset.trafficSource ?? "snap") === "facebook") {
      column.facebook.push(preset);
    } else {
      column.snap.push(preset);
    }
  }
  return Array.from(columns.values()).sort(
    (a, b) => b.snap.length + b.facebook.length - (a.snap.length + a.facebook.length)
  );
}

function PlatformGroup({
  source,
  count,
  children,
}: {
  source: "snap" | "facebook";
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            source === "facebook" ? "bg-blue-500" : "bg-yellow-500"
          }`}
        />
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {source === "facebook" ? "Facebook" : "Snap"} · {count}
        </span>
        <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function PresetCard({
  preset,
  pixelMap,
  groupMap,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  preset: CampaignPreset;
  pixelMap: Record<string, SavedPixel>;
  groupMap: Record<string, CountryGroup>;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const sq0 = preset.adSquads?.[0];
  const isFacebook = (preset.trafficSource ?? "snap") === "facebook";
  const pixelName = sq0?.pixelId ? (pixelMap[sq0.pixelId]?.name ?? sq0.pixelId) : null;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5">
      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 leading-snug mb-1.5">{preset.name}</p>

      <div className="space-y-1 text-[11px]">
        {isFacebook ? (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 dark:text-gray-500">Geo</span>
            <span className="text-gray-600 dark:text-gray-300 text-right truncate">
              {geoText(preset, groupMap)}
            </span>
          </div>
        ) : (
          <>
            {pixelName && (
              <div className="flex justify-between gap-2">
                <span className="text-gray-400 dark:text-gray-500">Pixel</span>
                <span className="text-gray-600 dark:text-gray-300 truncate">{pixelName}</span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-gray-400 dark:text-gray-500">Bid</span>
              <span className="text-gray-600 dark:text-gray-300 font-mono">{bidText(sq0)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-400 dark:text-gray-500">Budget</span>
              <span className="text-gray-600 dark:text-gray-300 font-mono">{budgetText(sq0)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-400 dark:text-gray-500">Device</span>
              <span className="text-gray-600 dark:text-gray-300">{deviceText(sq0)}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2.5 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={onEdit}
          className="text-[11px] font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        >
          Edit
        </button>
        <button
          onClick={onDuplicate}
          className="text-[11px] font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        >
          Duplicate
        </button>
        <button
          onClick={onDelete}
          className="text-[11px] font-medium text-red-400 hover:text-red-600 ml-auto"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function PresetsPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<CampaignPreset[]>([]);
  const [providerMap, setProviderMap] = useState<Record<string, FeedProvider>>({});
  const [pixelMap, setPixelMap] = useState<Record<string, SavedPixel>>({});
  const [groupMap, setGroupMap] = useState<Record<string, CountryGroup>>({});
  const [showCountryGroups, setShowCountryGroups] = useState(false);

  function reloadGroups() {
    setGroupMap(Object.fromEntries(loadCountryGroups().map((g) => [g.id, g])));
  }

  useEffect(() => {
    setPresets(loadPresets());
    const providers = loadFeedProviders();
    setProviderMap(Object.fromEntries(providers.map((p) => [p.id, p])));
    const pixels = loadPixels();
    setPixelMap(Object.fromEntries(pixels.map((px) => [px.pixelId, px])));
    reloadGroups();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Campaign Presets</h1>
          <p className="text-sm text-gray-500 mt-1">
            Reusable ad set configurations — select a preset in the wizard canvas.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCountryGroups(true)}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-gray-950 text-sm font-semibold transition-colors"
          >
            Country Groups
          </button>
          <button
            onClick={() => router.push("/dashboard/presets/new")}
            className="px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-sm font-semibold transition-colors"
          >
            + New Preset
          </button>
        </div>
      </div>

      {presets.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-500 text-sm">No presets saved yet.</p>
          <button
            onClick={() => router.push("/dashboard/presets/new")}
            className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
          >
            Create your first preset
          </button>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {buildFeedColumns(presets, providerMap).map((column) => (
            <div
              key={column.providerId}
              className="shrink-0 w-64 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl p-3"
            >
              <h3 className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2.5 px-0.5">
                <span className={column.providerMissing ? "text-amber-600 dark:text-amber-400" : ""}>
                  {column.providerName}
                </span>
                <span className="font-mono font-medium text-gray-400 dark:text-gray-500">
                  {column.snap.length + column.facebook.length}
                </span>
              </h3>

              {column.snap.length > 0 && (
                <PlatformGroup source="snap" count={column.snap.length}>
                  {column.snap.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      preset={preset}
                      pixelMap={pixelMap}
                      groupMap={groupMap}
                      onEdit={() => router.push(`/dashboard/presets/${preset.id}/edit`)}
                      onDuplicate={() => handleDuplicate(preset.id)}
                      onDelete={() => handleDelete(preset.id, preset.name)}
                    />
                  ))}
                </PlatformGroup>
              )}

              {column.facebook.length > 0 && (
                <PlatformGroup source="facebook" count={column.facebook.length}>
                  {column.facebook.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      preset={preset}
                      pixelMap={pixelMap}
                      groupMap={groupMap}
                      onEdit={() => router.push(`/dashboard/presets/${preset.id}/edit`)}
                      onDuplicate={() => handleDuplicate(preset.id)}
                      onDelete={() => handleDelete(preset.id, preset.name)}
                    />
                  ))}
                </PlatformGroup>
              )}
            </div>
          ))}

          <button
            onClick={() => router.push("/dashboard/feed-providers")}
            className="shrink-0 w-64 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex items-center justify-center text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-400 transition-colors"
          >
            + Add feed provider
          </button>
        </div>
      )}

      {showCountryGroups && (
        <CountryGroupsModal
          onClose={() => {
            setShowCountryGroups(false);
            reloadGroups();
            setPresets(loadPresets());
          }}
        />
      )}
    </div>
  );
}
