"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { loadPresets, deletePreset, duplicatePreset } from "@/lib/presets";
import { loadFeedProviders } from "@/lib/feed-providers";
import { loadPixels } from "@/lib/pixels";
import { loadMetaPixels } from "@/lib/meta-pixels";
import { loadCountryGroups } from "@/lib/country-groups";
import { CountryGroupsModal } from "@/components/presets/CountryGroupsModal";
import type { CampaignPreset, AdSquadPresetData, MetaAdSetPresetData } from "@/types/preset";
import type { FeedProvider } from "@/types/feed-provider";
import type { SavedPixel } from "@/types/pixel";
import type { SavedMetaPixel } from "@/types/meta-pixel";
import type { CountryGroup } from "@/types/country-group";
import { formatRoasPercent } from "@/lib/roas-floor";
import { centsToUsd } from "@/lib/money";

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

function metaBidText(metaAdSet?: MetaAdSetPresetData): string {
  if (!metaAdSet) return "—";
  if (metaAdSet.bidStrategy === "COST_CAP" && metaAdSet.bidAmountCents) {
    return `Cost cap $${centsToUsd(metaAdSet.bidAmountCents).toFixed(2)}`;
  }
  if (metaAdSet.bidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && metaAdSet.roasFloor) {
    // Percentage of the stored RATIO, which is now provider-independent — the launcher
    // applies the provider's roasDisplayDivisor. A legacy hand-scaled value (>= 10, e.g.
    // the "WW" preset holding 90) still reads as a huge percentage here even though
    // roas-floor.ts normalises it at launch, so this label overstates those until the
    // stored value is set back to a true ratio. See lib/roas-floor.ts.
    return `ROAS floor ${formatRoasPercent(metaAdSet.roasFloor)}`;
  }
  return "Lowest cost";
}

function metaBudgetText(metaAdSet?: MetaAdSetPresetData): string {
  if (!metaAdSet || !metaAdSet.dailyBudgetCents) return "—";
  return `$${centsToUsd(metaAdSet.dailyBudgetCents).toFixed(2)}/day`;
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
  children,
}: {
  source: "snap" | "facebook";
  children: ReactNode;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
            source === "facebook"
              ? "bg-blue-50 text-blue-600 dark:bg-blue-900/25 dark:text-blue-400"
              : "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/25 dark:text-yellow-400"
          }`}
        >
          {source === "facebook" ? "Facebook" : "Snap"}
        </span>
        <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-none">
      <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 text-right truncate">{value}</span>
    </div>
  );
}

function PresetCard({
  preset,
  pixelMap,
  metaPixelMap,
  groupMap,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  preset: CampaignPreset;
  pixelMap: Record<string, SavedPixel>;
  metaPixelMap: Record<string, SavedMetaPixel>;
  groupMap: Record<string, CountryGroup>;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const sq0 = preset.adSquads?.[0];
  const isFacebook = (preset.trafficSource ?? "snap") === "facebook";
  const pixelName = isFacebook
    ? preset.metaAdSet?.pixelId
      ? metaPixelMap[preset.metaAdSet.pixelId]?.name ?? preset.metaAdSet.pixelId
      : "—"
    : sq0?.pixelId
      ? pixelMap[sq0.pixelId]?.name ?? sq0.pixelId
      : "—";

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug mb-3">{preset.name}</p>

      <div>
        {isFacebook && <StatRow label="Geo group" value={geoText(preset, groupMap)} />}
        <StatRow label="Pixel" value={pixelName} />
        <StatRow label="Bid" value={isFacebook ? metaBidText(preset.metaAdSet) : bidText(sq0)} />
        <StatRow label="Budget" value={isFacebook ? metaBudgetText(preset.metaAdSet) : budgetText(sq0)} />
        <StatRow label="Device" value={isFacebook ? "All" : deviceText(sq0)} />
      </div>

      <div className="flex items-center gap-2 mt-3.5">
        <button
          onClick={onEdit}
          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onDuplicate}
          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          Duplicate
        </button>
        <button
          onClick={onDelete}
          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg text-red-500 hover:text-red-600 ml-auto transition-colors"
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
  const [metaPixelMap, setMetaPixelMap] = useState<Record<string, SavedMetaPixel>>({});
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
    const metaPixels = loadMetaPixels();
    setMetaPixelMap(Object.fromEntries(metaPixels.map((px) => [px.pixelId, px])));
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
    <div className="space-y-6 max-w-6xl mx-auto">
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
        <div className="flex items-start gap-5 overflow-x-auto pb-2">
          {buildFeedColumns(presets, providerMap).map((column) => {
            const hasBoth = column.snap.length > 0 && column.facebook.length > 0;
            return (
              <div
                key={column.providerId}
                className={`shrink-0 ${hasBoth ? "w-[560px]" : "w-[300px]"} bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-2xl p-[18px]`}
              >
                <h3 className={`text-sm font-bold ${column.providerMissing ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-gray-100"}`}>
                  {column.providerName}
                </h3>
                <p className="text-[11.5px] text-gray-400 dark:text-gray-500 mb-4">
                  {column.snap.length + column.facebook.length} preset
                  {column.snap.length + column.facebook.length !== 1 ? "s" : ""}
                </p>

                <div className={hasBoth ? "grid grid-cols-2 gap-5 items-start" : undefined}>
                  {column.snap.length > 0 && (
                    <PlatformGroup source="snap">
                      {column.snap.map((preset) => (
                        <PresetCard
                          key={preset.id}
                          preset={preset}
                          pixelMap={pixelMap}
                          metaPixelMap={metaPixelMap}
                          groupMap={groupMap}
                          onEdit={() => router.push(`/dashboard/presets/${preset.id}/edit`)}
                          onDuplicate={() => handleDuplicate(preset.id)}
                          onDelete={() => handleDelete(preset.id, preset.name)}
                        />
                      ))}
                    </PlatformGroup>
                  )}

                  {column.facebook.length > 0 && (
                    <PlatformGroup source="facebook">
                      {column.facebook.map((preset) => (
                        <PresetCard
                          key={preset.id}
                          preset={preset}
                          pixelMap={pixelMap}
                          metaPixelMap={metaPixelMap}
                          groupMap={groupMap}
                          onEdit={() => router.push(`/dashboard/presets/${preset.id}/edit`)}
                          onDuplicate={() => handleDuplicate(preset.id)}
                          onDelete={() => handleDelete(preset.id, preset.name)}
                        />
                      ))}
                    </PlatformGroup>
                  )}
                </div>
              </div>
            );
          })}

          <button
            onClick={() => router.push("/dashboard/feed-providers")}
            className="shrink-0 self-stretch w-40 border border-dashed border-gray-300 dark:border-gray-600 rounded-2xl flex items-center justify-center text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-400 transition-colors"
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
