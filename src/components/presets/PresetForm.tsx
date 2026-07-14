"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { Input, Select, Button } from "@/components/ui";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { upsertPreset } from "@/lib/presets";
import { loadPixels } from "@/lib/pixels";
import { loadMetaPixels } from "@/lib/meta-pixels";
import { loadFeedProviders } from "@/lib/feed-providers";
import { loadCountryGroups } from "@/lib/country-groups";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import type { CampaignPreset, MetaAdSetPresetData } from "@/types/preset";
import type { SavedPixel } from "@/types/pixel";
import type { SavedMetaPixel } from "@/types/meta-pixel";
import type { FeedProvider } from "@/types/feed-provider";
import type { MetaOptimizationGoal, MetaBillingEvent, MetaPixelEvent, MetaBidStrategy } from "@/types/meta";
import type { CountryGroup } from "@/types/country-group";

// ─── Schema ───────────────────────────────────────────────────────────────────

const presetFormSchema = z
  .object({
    presetName: z.string().min(1, "Preset name is required"),
    geoCountryCodes: z.array(z.string().min(2)).min(1, "Select at least one country"),
    trafficSource: z.enum(["snap", "facebook"]),
    optimizationGoal: z.enum([
      "PIXEL_PURCHASE", "PIXEL_SIGNUP", "PIXEL_ADD_TO_CART", "PIXEL_PAGE_VIEW", "LANDING_PAGE_VIEW",
    ]).optional(),
    bidStrategy: z.enum(["AUTO_BID", "LOWEST_COST_WITH_MAX_BID", "TARGET_COST"]).optional(),
    bidAmountUsd: z.number().optional(),
    dailyBudgetUsd: z.number().optional(),
    smartPlacement: z.boolean().optional(),
    targetingDeviceType: z.enum(["WEB", "MOBILE", "ALL"]).optional(),
    targetingOsType: z.enum(["iOS", "ANDROID"]).optional(),
    pixelId: z.string().optional(),
    minAge: z.string().optional(),
    maxAge: z.string().optional(),
    status: z.enum(["ACTIVE", "PAUSED"]),
  })
  .superRefine((data, ctx) => {
    if (data.trafficSource === "snap") {
      if (!data.optimizationGoal) {
        ctx.addIssue({ code: "custom", path: ["optimizationGoal"], message: "Required for Snap" });
      }
      if (!data.bidStrategy) {
        ctx.addIssue({ code: "custom", path: ["bidStrategy"], message: "Required for Snap" });
      }
      if (data.bidStrategy && data.bidStrategy !== "AUTO_BID" && (!data.bidAmountUsd || data.bidAmountUsd <= 0)) {
        ctx.addIssue({ code: "custom", path: ["bidAmountUsd"], message: "Bid amount required" });
      }
      if (!data.dailyBudgetUsd || data.dailyBudgetUsd < 5) {
        ctx.addIssue({ code: "custom", path: ["dailyBudgetUsd"], message: "Minimum $5" });
      }
    }
  });

type PresetFormValues = z.infer<typeof presetFormSchema>;

// ─── Options ─────────────────────────────────────────────────────────────────

const OPTIMIZATION_GOAL_OPTIONS = [
  { value: "PIXEL_PURCHASE", label: "Pixel Purchase" },
  { value: "PIXEL_SIGNUP", label: "Pixel Sign Up" },
  { value: "PIXEL_ADD_TO_CART", label: "Pixel Add to Cart" },
  { value: "PIXEL_PAGE_VIEW", label: "Pixel Page View" },
  { value: "LANDING_PAGE_VIEW", label: "Landing Page View" },
];

const BID_STRATEGY_OPTIONS = [
  { value: "AUTO_BID", label: "Auto Bid" },
  { value: "LOWEST_COST_WITH_MAX_BID", label: "Lowest Cost with Max Bid" },
  { value: "TARGET_COST", label: "Target Cost" },
];

const DEVICE_OPTIONS = [
  { value: "ALL", label: "All Devices" },
  { value: "MOBILE", label: "Mobile" },
  { value: "WEB", label: "Web" },
];

const OS_OPTIONS = [
  { value: "", label: "All" },
  { value: "iOS", label: "iOS" },
  { value: "ANDROID", label: "Android" },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
];

const AGE_OPTIONS = [
  { value: "", label: "Any" },
  ...Array.from({ length: 42 }, (_, i) => ({ value: String(i + 13), label: String(i + 13) })),
  { value: "55", label: "55+" },
];

const selectCls =
  "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white dark:bg-gray-800 dark:text-gray-100";

// ─── Component ────────────────────────────────────────────────────────────────

interface PresetFormProps {
  preset?: CampaignPreset;
}

export function PresetForm({ preset }: PresetFormProps) {
  const router = useRouter();

  const [trafficSource, setTrafficSource] = useState<"snap" | "facebook">(
    preset?.trafficSource ?? "snap"
  );
  const [isCatalogue, setIsCatalogue] = useState<boolean>(preset?.isCatalogue ?? false);
  const [catalogId, setCatalogId] = useState<string>(preset?.adSquads?.[0]?.catalogId ?? "");
  const [productSetId, setProductSetId] = useState<string>(preset?.adSquads?.[0]?.productSetId ?? "");
  const [dynamicTemplateId, setDynamicTemplateId] = useState<string>(preset?.adSquads?.[0]?.dynamicTemplateId ?? "");
  const [feedProviderId, setFeedProviderId] = useState<string>(preset?.feedProviderId ?? "");
  const [tag, setTag] = useState<string>(preset?.tag ?? "");
  const [adStatus, setAdStatus] = useState<"ACTIVE" | "PAUSED">(
    preset?.creativeDefaults?.adStatus ?? "PAUSED"
  );
  const [pixels, setPixels] = useState<SavedPixel[]>([]);
  const [feedProviders, setFeedProviders] = useState<FeedProvider[]>([]);
  const [countryGroups, setCountryGroups] = useState<CountryGroup[]>([]);
  const [countryGroupId, setCountryGroupId] = useState<string | undefined>(preset?.countryGroupId);

  // Meta-specific state
  const existingMetaAdSet = preset?.metaAdSet;
  const [metaBillingEvent, setMetaBillingEvent] = useState<MetaBillingEvent>(existingMetaAdSet?.billingEvent ?? "IMPRESSIONS");
  const [metaPixelEvent, setMetaPixelEvent] = useState<MetaPixelEvent>(existingMetaAdSet?.pixelEvent ?? "PURCHASE");
  const [metaDailyBudgetUsd, setMetaDailyBudgetUsd] = useState<number>(
    existingMetaAdSet?.dailyBudgetCents ? existingMetaAdSet.dailyBudgetCents / 100 : 20
  );
  // Bidding strategy — two performance goals, each with an optional bid goal.
  // Any legacy optimizationGoal other than VALUE (e.g. old LINK_CLICKS/REACH
  // presets) falls back to "conversions" — those goals aren't valid for this
  // app's hardcoded OUTCOME_SALES objective anyway.
  const [metaBidChoice, setMetaBidChoice] = useState<"conversions" | "value">(
    existingMetaAdSet?.optimizationGoal === "VALUE" ? "value" : "conversions"
  );
  const [metaCostPerResultUsd, setMetaCostPerResultUsd] = useState<number | undefined>(
    existingMetaAdSet?.bidStrategy === "COST_CAP" && existingMetaAdSet.bidAmountCents
      ? existingMetaAdSet.bidAmountCents / 100
      : undefined
  );
  const [metaRoasGoal, setMetaRoasGoal] = useState<number | undefined>(
    existingMetaAdSet?.bidStrategy === "LOWEST_COST_WITH_MIN_ROAS" ? existingMetaAdSet.roasFloor : undefined
  );
  const [metaPublisherPlatforms, setMetaPublisherPlatforms] = useState<("facebook" | "instagram" | "audience_network")[]>(
    existingMetaAdSet?.publisherPlatforms ?? ["facebook", "instagram"]
  );
  const [metaPixels, setMetaPixels] = useState<SavedMetaPixel[]>([]);

  useEffect(() => {
    setPixels(loadPixels());
    setMetaPixels(loadMetaPixels());
    setFeedProviders(loadFeedProviders());
    setCountryGroups(loadCountryGroups());
  }, []);

  const pixelOptions = pixels.map((p) => ({ value: p.pixelId, label: p.name }));
  const metaPixelOptions = metaPixels.map((p) => ({ value: p.pixelId, label: p.name }));

  const sq0 = preset?.adSquads?.[0];

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PresetFormValues>({
    resolver: zodResolver(presetFormSchema),
    // Keyed on `preset` (not `sq0`) — Meta presets always save adSquads: [], so
    // sq0 is undefined for every Meta preset. Keying on sq0 alone meant editing
    // an existing Meta preset silently reset shared fields (name, geo, pixel,
    // status) to blank/"new preset" defaults. Fall back to existingMetaAdSet
    // for the fields Meta presets actually populate.
    defaultValues: preset
      ? {
          presetName: preset.name,
          trafficSource: preset.trafficSource ?? "snap",
          geoCountryCodes:
            (sq0 as unknown as { geoCountryCodes?: string[]; geoCountryCode?: string } | undefined)
              ?.geoCountryCodes ??
            existingMetaAdSet?.geoCountryCodes ??
            [
              (sq0 as unknown as { geoCountryCode?: string } | undefined)?.geoCountryCode ?? "US",
            ],
          optimizationGoal: sq0?.optimizationGoal ?? "PIXEL_PURCHASE",
          bidStrategy: sq0?.bidStrategy ?? "AUTO_BID",
          bidAmountUsd: sq0?.bidAmountUsd,
          dailyBudgetUsd: sq0?.dailyBudgetUsd,
          smartPlacement: sq0?.smartPlacement ?? false,
          targetingDeviceType: sq0?.targetingDeviceType ?? "ALL",
          targetingOsType: sq0?.targetingOsType,
          minAge: sq0?.minAge,
          maxAge: sq0?.maxAge,
          pixelId: sq0?.pixelId ?? existingMetaAdSet?.pixelId,
          status: sq0?.status ?? existingMetaAdSet?.status ?? "PAUSED",
        }
      : {
          presetName: "",
          trafficSource: "snap" as const,
          geoCountryCodes: ["US"],
          optimizationGoal: "PIXEL_PURCHASE",
          bidStrategy: "AUTO_BID",
          dailyBudgetUsd: 20,
          smartPlacement: false,
          targetingDeviceType: "ALL",
          status: "PAUSED",
        },
  });

  const bidStrategy = useWatch({ control, name: "bidStrategy" });
  const deviceType = useWatch({ control, name: "targetingDeviceType" });

  useEffect(() => {
    if (sq0?.pixelId && pixels.length > 0) {
      setValue("pixelId", sq0.pixelId);
    }
  }, [pixels, sq0?.pixelId, setValue]);

  useEffect(() => {
    if (existingMetaAdSet?.pixelId && metaPixels.length > 0) {
      setValue("pixelId", existingMetaAdSet.pixelId);
    }
  }, [metaPixels, existingMetaAdSet?.pixelId, setValue]);

  // A linked preset's geo targeting IS the group's current list — selecting a
  // group resolves its members into the form immediately; picking "Custom"
  // unlinks and leaves whatever codes are currently in the field editable.
  function handleSelectCountryGroup(groupId: string) {
    if (!groupId) {
      setCountryGroupId(undefined);
      return;
    }
    const group = countryGroups.find((g) => g.id === groupId);
    if (!group) return;
    setCountryGroupId(groupId);
    setValue("geoCountryCodes", group.countryCodes);
  }

  const onSubmit = (data: PresetFormValues) => {
    if (isCatalogue && !catalogId.trim()) {
      alert("Catalog ID is required for Catalogue campaigns.");
      return;
    }
    if (isCatalogue && !productSetId.trim()) {
      alert("Product Set ID is required for Catalogue campaigns.");
      return;
    }
    const isMeta = trafficSource === "facebook";

    const metaOptimizationGoal: MetaOptimizationGoal = metaBidChoice === "value" ? "VALUE" : "OFFSITE_CONVERSIONS";
    const metaBidStrategy: MetaBidStrategy =
      metaBidChoice === "conversions" && metaCostPerResultUsd
        ? "COST_CAP"
        : metaBidChoice === "value" && metaRoasGoal
        ? "LOWEST_COST_WITH_MIN_ROAS"
        : "LOWEST_COST_WITHOUT_CAP";

    const metaAdSet: MetaAdSetPresetData | undefined = isMeta
      ? {
          geoCountryCodes: data.geoCountryCodes,
          optimizationGoal: metaOptimizationGoal,
          billingEvent: metaBillingEvent,
          bidStrategy: metaBidStrategy,
          bidAmountCents: metaBidStrategy === "COST_CAP" ? Math.round(metaCostPerResultUsd! * 100) : undefined,
          roasFloor: metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS" ? metaRoasGoal : undefined,
          dailyBudgetCents: Math.round(metaDailyBudgetUsd * 100),
          status: data.status,
          pixelId: data.pixelId || undefined,
          pixelEvent: data.pixelId ? metaPixelEvent : undefined,
          minAge: data.minAge ? Number(data.minAge) : undefined,
          maxAge: data.maxAge ? Number(data.maxAge) : undefined,
          publisherPlatforms: metaPublisherPlatforms,
        }
      : undefined;

    const saved: CampaignPreset = {
      id: preset?.id ?? uuid(),
      name: data.presetName,
      tag: tag || undefined,
      trafficSource,
      isCatalogue: isMeta ? false : isCatalogue,
      feedProviderId,
      countryGroupId,
      createdAt: preset?.createdAt ?? new Date().toISOString(),
      campaign: {
        objective: "SALES",
        status: "ACTIVE",
        spendCapType: "NO_BUDGET",
        startDate: undefined,
        endDate: undefined,
      },
      adSquads: isMeta
        ? []
        : [
            {
              type: "SNAP_ADS",
              geoCountryCodes: data.geoCountryCodes,
              optimizationGoal: data.optimizationGoal ?? "PIXEL_PURCHASE",
              bidStrategy: data.bidStrategy ?? "AUTO_BID",
              bidAmountUsd: data.bidAmountUsd,
              spendCapType: "DAILY_BUDGET",
              dailyBudgetUsd: data.dailyBudgetUsd,
              status: data.status,
              startDate: undefined,
              endDate: undefined,
              smartPlacement: data.smartPlacement,
              targetingGender: undefined,
              targetingDeviceType: data.targetingDeviceType,
              targetingOsType: data.targetingOsType,
              minAge: data.minAge || undefined,
              maxAge: data.maxAge || undefined,
              pixelId: data.pixelId || undefined,
              catalogId: isCatalogue ? catalogId.trim() : undefined,
              productSetId: isCatalogue ? productSetId.trim() : undefined,
              dynamicTemplateId: isCatalogue && dynamicTemplateId.trim() ? dynamicTemplateId.trim() : undefined,
            },
          ],
      metaAdSet,
      creativeDefaults: {
        adStatus,
      },
    };
    upsertPreset(saved);
    router.push("/dashboard/presets");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-8">
      {/* Campaign Type — Snap only */}
      {trafficSource === "snap" && (
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Campaign Type</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsCatalogue(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                !isCatalogue
                  ? "bg-yellow-400 border-yellow-400 text-gray-900"
                  : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400"
              }`}
            >
              {!isCatalogue && <span className="mr-1">✓</span>}
              Regular
            </button>
            <button
              type="button"
              onClick={() => setIsCatalogue(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                isCatalogue
                  ? "bg-violet-500 border-violet-500 text-white"
                  : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400"
              }`}
            >
              {isCatalogue && <span className="mr-1">✓</span>}
              Catalogue (DPA)
            </button>
          </div>
          {isCatalogue && (
            <p className="text-xs text-violet-400 mt-2">
              Collection ad: you still pick a hero image/video in the wizard — Snapchat adds a row of
              dynamic product tiles from your catalogue beneath it.
            </p>
          )}
        </div>
      )}

      {/* Traffic Source */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Traffic Source</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setTrafficSource("snap"); setValue("trafficSource", "snap"); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
              trafficSource === "snap"
                ? "bg-yellow-400 border-yellow-400 text-gray-900"
                : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400"
            }`}
          >
            {trafficSource === "snap" && <span>✓</span>}
            Snap
          </button>
          <button
            type="button"
            onClick={() => { setTrafficSource("facebook"); setValue("trafficSource", "facebook"); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
              trafficSource === "facebook"
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400"
            }`}
          >
            {trafficSource === "facebook" && <span>✓</span>}
            Facebook
          </button>
        </div>
      </div>

      {/* Basic info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="sm:col-span-2">
          <Input
            label="Preset Name"
            placeholder="e.g. US Mobile — Auto Bid"
            {...register("presetName")}
            error={errors.presetName?.message}
          />
        </div>

        <div className="sm:col-span-2">
          <Input
            label="Preset Tag"
            placeholder="e.g. T1"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            Used in campaign naming templates as{" "}
            <code className="bg-gray-100 px-1 rounded">{"{{preset.tag}}"}</code>.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Feed Provider</label>
          <select
            value={feedProviderId}
            onChange={(e) => {
              setFeedProviderId(e.target.value);
            }}
            className={selectCls}
          >
            <option value="">— Select provider —</option>
            {feedProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {!feedProviderId && (
            <p className="text-xs text-amber-600 mt-1">
              Assign a feed provider so this preset appears in the wizard.
            </p>
          )}
        </div>
      </div>

      {/* Catalogue fields */}
      {isCatalogue && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5 space-y-4">
          <p className="text-sm font-semibold text-violet-300">Dynamic Collection Ads Configuration</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Catalog ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={catalogId}
              onChange={(e) => setCatalogId(e.target.value)}
              placeholder="e.g. e122b578-..."
              className="w-full px-3 py-2 text-sm border border-violet-500/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-gray-900 text-gray-100 placeholder-gray-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Find in Snapchat Business Manager → Catalogues (the catalogue this product set belongs to).
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Product Set ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={productSetId}
              onChange={(e) => setProductSetId(e.target.value)}
              placeholder="e.g. a1b2c3d4-..."
              className="w-full px-3 py-2 text-sm border border-violet-500/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-gray-900 text-gray-100 placeholder-gray-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Find in Snapchat Business Manager → Catalogues → Product Sets.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Dynamic Template ID <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={dynamicTemplateId}
              onChange={(e) => setDynamicTemplateId(e.target.value)}
              placeholder="Leave blank to use Snapchat default"
              className="w-full px-3 py-2 text-sm border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-gray-900 text-gray-100 placeholder-gray-500"
            />
          </div>
        </div>
      )}

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Targeting */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="sm:col-span-2 space-y-2">
          {countryGroups.length > 0 && (
            <Select
              label="Country Group"
              options={[
                { value: "", label: "— Custom (no group) —" },
                ...countryGroups.map((g) => ({ value: g.id, label: g.name })),
              ]}
              value={countryGroupId ?? ""}
              onChange={(e) => handleSelectCountryGroup(e.target.value)}
            />
          )}
          <Controller
            control={control}
            name="geoCountryCodes"
            render={({ field }) =>
              countryGroupId ? (
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Geo Targeting
                  </label>
                  <p className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {field.value.join(", ")}{" "}
                    <span className="text-xs text-gray-400">(from group — switch to Custom to edit)</span>
                  </p>
                </div>
              ) : (
                <MultiSelect
                  label="Geo Targeting"
                  options={COUNTRY_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.geoCountryCodes?.message}
                />
              )
            }
          />
        </div>

        {trafficSource === "snap" && (
          <>
            <Select
              label="Device"
              options={DEVICE_OPTIONS}
              {...register("targetingDeviceType", {
                onChange: () => setValue("targetingOsType", undefined),
              })}
            />

            {deviceType === "MOBILE" && (
              <Select label="OS" options={OS_OPTIONS} {...register("targetingOsType")} />
            )}
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min Age</label>
          <select {...register("minAge")} className={selectCls}>
            {AGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Age</label>
          <select {...register("maxAge")} className={selectCls}>
            {AGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {trafficSource === "snap" && (
          <div className="sm:col-span-2 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/10 p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" {...register("smartPlacement")} className="mt-0.5 accent-yellow-500" />
              <span className="text-sm">
                <span className="font-medium text-gray-800 dark:text-gray-200">Smart placement (let Snapchat auto-optimize where ads run)</span>
                <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                  ⚠ Ad sets launched with Smart placement are locked by Snapchat — you must change their budget, bid, or pause them in Snapchat Ads Manager, not in this app. Leave this off to keep full in-app editing (uses Snapchat&apos;s default placement).
                </span>
              </span>
            </label>
          </div>
        )}

        {trafficSource === "facebook" && (
          <div className="sm:col-span-2 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Publisher Platforms</label>
              <div className="flex gap-2">
                {(["facebook", "instagram", "audience_network"] as const).map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={metaPublisherPlatforms.includes(p)}
                      onChange={() =>
                        setMetaPublisherPlatforms((prev) =>
                          prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                        )
                      }
                      className="rounded border-gray-300"
                    />
                    {p === "audience_network" ? "Audience Network" : p.charAt(0).toUpperCase() + p.slice(1)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Bidding & Tracking */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pixel (optional)</label>
          <select {...register("pixelId")} className={selectCls}>
            <option value="">— None —</option>
            {(trafficSource === "facebook" ? metaPixelOptions : pixelOptions).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {trafficSource === "facebook" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pixel Event</label>
            <select
              value={metaPixelEvent}
              onChange={(e) => setMetaPixelEvent(e.target.value as MetaPixelEvent)}
              className={selectCls}
            >
              <option value="PURCHASE">Purchase</option>
              <option value="ADD_TO_CART">Add to Cart</option>
              <option value="INITIATED_CHECKOUT">Initiated Checkout</option>
              <option value="VIEW_CONTENT">View Content</option>
              <option value="LEAD">Lead</option>
              <option value="COMPLETE_REGISTRATION">Complete Registration</option>
            </select>
          </div>
        )}

        {trafficSource === "snap" ? (
          <>
            <Select
              label="Optimization Goal"
              options={OPTIMIZATION_GOAL_OPTIONS}
              {...register("optimizationGoal")}
              error={errors.optimizationGoal?.message}
            />

            <Select
              label="Bid Strategy"
              options={BID_STRATEGY_OPTIONS}
              {...register("bidStrategy", {
                onChange: () => setValue("bidAmountUsd", undefined),
              })}
              error={errors.bidStrategy?.message}
            />

            {bidStrategy !== "AUTO_BID" && (
              <Input
                label="Bid Amount (USD)"
                type="number"
                min={0.01}
                step={0.01}
                {...register("bidAmountUsd", { valueAsNumber: true })}
                error={errors.bidAmountUsd?.message}
              />
            )}

            <Input
              label="Daily Budget (USD)"
              type="number"
              min={5}
              step={1}
              placeholder="Min $5"
              {...register("dailyBudgetUsd", { valueAsNumber: true })}
              error={errors.dailyBudgetUsd?.message}
            />
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bidding Strategy</label>
              <select
                value={metaBidChoice}
                onChange={(e) => setMetaBidChoice(e.target.value as "conversions" | "value")}
                className={selectCls}
              >
                <option value="conversions">Maximize number of conversions</option>
                <option value="value">Maximize value of conversions</option>
              </select>
            </div>

            {metaBidChoice === "conversions" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cost per Result Goal (USD, optional)
                </label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={metaCostPerResultUsd ?? ""}
                  onChange={(e) => setMetaCostPerResultUsd(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Leave empty for no cap"
                  className={selectCls}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  ROAS Goal (optional)
                </label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={metaRoasGoal ?? ""}
                  onChange={(e) => setMetaRoasGoal(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g. 4 = 400% return"
                  className={selectCls}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Billing Event</label>
              <select
                value={metaBillingEvent}
                onChange={(e) => setMetaBillingEvent(e.target.value as MetaBillingEvent)}
                className={selectCls}
              >
                <option value="IMPRESSIONS">Impressions</option>
                <option value="LINK_CLICKS">Link Clicks</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Daily Budget (USD)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={metaDailyBudgetUsd}
                onChange={(e) => setMetaDailyBudgetUsd(Number(e.target.value))}
                className={selectCls}
              />
              <p className="text-xs text-gray-400 mt-1">Min $1.</p>
            </div>
          </>
        )}
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Select
          label="Ad Set Status"
          options={STATUS_OPTIONS}
          {...register("status")}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ad Status</label>
          <select
            value={adStatus}
            onChange={(e) => setAdStatus(e.target.value as "ACTIVE" | "PAUSED")}
            className={selectCls}
          >
            <option value="PAUSED">Paused</option>
            <option value="ACTIVE">Active</option>
          </select>
        </div>

      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
        <Button type="button" variant="ghost" onClick={() => router.push("/dashboard/presets")}>
          Cancel
        </Button>
        <Button type="submit" size="lg">
          {preset ? "Update Preset" : "Save Preset"}
        </Button>
      </div>
    </form>
  );
}
