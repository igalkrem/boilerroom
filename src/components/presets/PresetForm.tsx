"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { Input, Select, Button } from "@/components/ui";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { upsertPreset } from "@/lib/presets";
import { loadPixels } from "@/lib/pixels";
import { loadFeedProviders } from "@/lib/feed-providers";
import type { CampaignPreset } from "@/types/preset";
import type { SavedPixel } from "@/types/pixel";
import type { FeedProvider } from "@/types/feed-provider";

// ─── Zod schema for the preset form ─────────────────────────────────────────

const presetCampaignSchema = z
  .object({
    startImmediate: z.boolean(),
    hasEndDate: z.boolean(),
    objective: z.literal("SALES"),
    status: z.enum(["ACTIVE", "PAUSED"]),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    spendCapType: z.enum(["DAILY_BUDGET", "NO_BUDGET"]),
    dailyBudgetUsd: z.number().optional(),
    lifetimeBudgetUsd: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.startImmediate && (!data.startDate || data.startDate.length === 0)) {
      ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date is required" });
    }
    if (data.hasEndDate && (!data.endDate || data.endDate.length === 0)) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is required" });
    }
    if (data.spendCapType === "DAILY_BUDGET") {
      if (!data.dailyBudgetUsd || data.dailyBudgetUsd < 20) {
        ctx.addIssue({ code: "custom", path: ["dailyBudgetUsd"], message: "Must be at least $20" });
      }
    }
  });

const presetAdSquadSchema = z
  .object({
    startImmediate: z.boolean(),
    hasEndDate: z.boolean(),
    type: z.literal("SNAP_ADS"),
    geoCountryCodes: z.array(z.string().min(2)).min(1, "Select at least one country"),
    optimizationGoal: z.enum([
      "PIXEL_PURCHASE", "PIXEL_SIGNUP", "PIXEL_ADD_TO_CART", "PIXEL_PAGE_VIEW", "LANDING_PAGE_VIEW",
    ]),
    bidStrategy: z.enum(["AUTO_BID", "LOWEST_COST_WITH_MAX_BID", "TARGET_COST"]),
    bidAmountUsd: z.number().optional(),
    spendCapType: z.enum(["DAILY_BUDGET", "LIFETIME_BUDGET"]),
    dailyBudgetUsd: z.number().optional(),
    lifetimeBudgetUsd: z.number().optional(),
    status: z.enum(["ACTIVE", "PAUSED"]),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    placementConfig: z.enum(["AUTOMATIC", "CONTENT"]),
    targetingGender: z.enum(["ALL", "MALE", "FEMALE"]).optional(),
    targetingDeviceType: z.enum(["WEB", "MOBILE", "ALL"]).optional(),
    targetingOsType: z.enum(["iOS", "ANDROID"]).optional(),
    pixelId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.startImmediate && (!data.startDate || data.startDate.length === 0)) {
      ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date is required" });
    }
    if (data.hasEndDate && (!data.endDate || data.endDate.length === 0)) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is required" });
    }
    if (data.spendCapType === "DAILY_BUDGET") {
      if (!data.dailyBudgetUsd || data.dailyBudgetUsd < 5) {
        ctx.addIssue({ code: "custom", path: ["dailyBudgetUsd"], message: "Minimum $5" });
      }
    } else {
      if (!data.lifetimeBudgetUsd || data.lifetimeBudgetUsd < 5) {
        ctx.addIssue({ code: "custom", path: ["lifetimeBudgetUsd"], message: "Minimum $5" });
      }
    }
    if (data.bidStrategy !== "AUTO_BID" && (!data.bidAmountUsd || data.bidAmountUsd <= 0)) {
      ctx.addIssue({ code: "custom", path: ["bidAmountUsd"], message: "Bid amount required" });
    }
  });

const presetFormSchema = z.object({
  presetName: z.string().min(1, "Preset name is required"),
  campaign: presetCampaignSchema,
  adSquads: z.array(presetAdSquadSchema).min(1, "Add at least one ad set template"),
});

type PresetFormValues = z.infer<typeof presetFormSchema>;

// ─── Option arrays ────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
];

const CAMPAIGN_SPEND_CAP_OPTIONS = [
  { value: "NO_BUDGET", label: "No Campaign Budget" },
  { value: "DAILY_BUDGET", label: "Daily Budget" },
];

const SPEND_CAP_OPTIONS = [
  { value: "DAILY_BUDGET", label: "Daily Budget" },
  { value: "LIFETIME_BUDGET", label: "Lifetime Budget" },
];

const GEO_OPTIONS = [
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "BR", label: "Brazil" },
  { value: "MX", label: "Mexico" },
  { value: "IN", label: "India" },
  { value: "IL", label: "Israel" },
];

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

const PLACEMENT_OPTIONS = [
  { value: "AUTOMATIC", label: "Automatic" },
  { value: "CONTENT", label: "Content" },
];

const GENDER_OPTIONS = [
  { value: "ALL", label: "All Genders" },
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
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

const CTA_OPTIONS = [
  { value: "", label: "— None —" },
  { value: "MORE", label: "More" },
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "WATCH", label: "Watch" },
  { value: "GET_NOW", label: "Get Now" },
  { value: "ORDER_NOW", label: "Order Now" },
  { value: "BOOK_NOW", label: "Book Now" },
  { value: "APPLY_NOW", label: "Apply Now" },
  { value: "BUY_NOW", label: "Buy Now" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultAdSquad(): PresetFormValues["adSquads"][number] {
  return {
    startImmediate: true,
    hasEndDate: false,
    type: "SNAP_ADS",
    geoCountryCodes: ["US"],
    optimizationGoal: "PIXEL_PURCHASE",
    bidStrategy: "AUTO_BID",
    spendCapType: "DAILY_BUDGET",
    dailyBudgetUsd: 20,
    status: "PAUSED",
    placementConfig: "AUTOMATIC",
    targetingGender: "ALL",
    targetingDeviceType: "ALL",
    pixelId: undefined,
  };
}

// ─── Ad Squad card sub-component ─────────────────────────────────────────────

function AdSquadCard({
  index,
  control,
  register,
  errors,
  setValue,
  pixelOptions,
  canRemove,
  onRemove,
  onDuplicate,
}: {
  index: number;
  control: ReturnType<typeof useForm<PresetFormValues>>["control"];
  register: ReturnType<typeof useForm<PresetFormValues>>["register"];
  errors: ReturnType<typeof useForm<PresetFormValues>>["formState"]["errors"];
  setValue: ReturnType<typeof useForm<PresetFormValues>>["setValue"];
  pixelOptions: Array<{ value: string; label: string }>;
  canRemove: boolean;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const prefix = `adSquads.${index}` as const;
  const bidStrategy = useWatch({ control, name: `adSquads.${index}.bidStrategy` });
  const spendCapType = useWatch({ control, name: `adSquads.${index}.spendCapType` });
  const startImmediate = useWatch({ control, name: `adSquads.${index}.startImmediate` });
  const hasEndDate = useWatch({ control, name: `adSquads.${index}.hasEndDate` });
  const deviceType = useWatch({ control, name: `adSquads.${index}.targetingDeviceType` });
  const squadErrors = errors.adSquads?.[index];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-800">Ad Set Template #{index + 1}</h4>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDuplicate}>
            ⎘ Duplicate
          </Button>
          {canRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              ✕ Remove
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Controller
          control={control}
          name={`${prefix}.geoCountryCodes`}
          render={({ field }) => (
            <MultiSelect
              label="Geo Targeting"
              options={GEO_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              error={squadErrors?.geoCountryCodes?.message}
            />
          )}
        />
        <Select
          label="Optimization Goal"
          options={OPTIMIZATION_GOAL_OPTIONS}
          {...register(`${prefix}.optimizationGoal`)}
          error={squadErrors?.optimizationGoal?.message}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Bid Strategy"
          options={BID_STRATEGY_OPTIONS}
          {...register(`${prefix}.bidStrategy`, {
            onChange: () => {
              setValue(`adSquads.${index}.bidAmountUsd`, undefined);
            },
          })}
          error={squadErrors?.bidStrategy?.message}
        />
        {bidStrategy !== "AUTO_BID" && (
          <Input
            label="Bid Amount (USD)"
            type="number"
            min={0.01}
            step={0.01}
            {...register(`${prefix}.bidAmountUsd`, { valueAsNumber: true })}
            error={squadErrors?.bidAmountUsd?.message}
          />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Budget Type"
          options={SPEND_CAP_OPTIONS}
          {...register(`${prefix}.spendCapType`, {
            onChange: () => {
              setValue(`adSquads.${index}.dailyBudgetUsd`, undefined);
              setValue(`adSquads.${index}.lifetimeBudgetUsd`, undefined);
            },
          })}
        />
        {spendCapType === "DAILY_BUDGET" ? (
          <Input
            label="Daily Budget (USD)"
            type="number"
            min={5}
            step={1}
            {...register(`${prefix}.dailyBudgetUsd`, { valueAsNumber: true })}
            error={squadErrors?.dailyBudgetUsd?.message}
          />
        ) : (
          <Input
            label="Lifetime Budget (USD)"
            type="number"
            min={5}
            step={1}
            {...register(`${prefix}.lifetimeBudgetUsd`, { valueAsNumber: true })}
            error={squadErrors?.lifetimeBudgetUsd?.message}
          />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Placement"
          options={PLACEMENT_OPTIONS}
          {...register(`${prefix}.placementConfig`)}
        />
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          {...register(`${prefix}.status`)}
        />
      </div>

      {/* Start date */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
            {...register(`${prefix}.startImmediate`, {
              onChange: (e) => {
                if (!e.target.checked) {
                  setValue(`adSquads.${index}.startDate`, todayIso());
                }
              },
            })}
          />
          <span className="text-sm font-medium text-gray-700">Launch immediately</span>
        </label>
        {!startImmediate && (
          <Input
            label="Start Date"
            type="date"
            {...register(`${prefix}.startDate`)}
            error={squadErrors?.startDate?.message}
          />
        )}
      </div>

      {/* End date */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
            {...register(`${prefix}.hasEndDate`)}
          />
          <span className="text-sm font-medium text-gray-700">Set an end date</span>
        </label>
        {hasEndDate && (
          <Input
            label="End Date"
            type="date"
            {...register(`${prefix}.endDate`)}
            error={squadErrors?.endDate?.message}
          />
        )}
      </div>

      {/* Tracking */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Tracking (optional)</p>
        <div className="max-w-sm">
          <Select
            label="Snap Pixel"
            options={[{ value: "", label: "— None —" }, ...pixelOptions]}
            {...register(`${prefix}.pixelId`)}
          />
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Audience Targeting (optional)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Select
            label="Gender"
            options={GENDER_OPTIONS}
            {...register(`${prefix}.targetingGender`)}
          />
          <Select
            label="Device"
            options={DEVICE_OPTIONS}
            {...register(`${prefix}.targetingDeviceType`, {
              onChange: () => setValue(`adSquads.${index}.targetingOsType`, undefined),
            })}
          />
          {deviceType === "MOBILE" && (
            <Select
              label="OS"
              options={OS_OPTIONS}
              {...register(`${prefix}.targetingOsType`)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main PresetForm component ────────────────────────────────────────────────

interface PresetFormProps {
  preset?: CampaignPreset;
}

export function PresetForm({ preset }: PresetFormProps) {
  const router = useRouter();
  const [pixels, setPixels] = useState<SavedPixel[]>([]);
  const [feedProviders, setFeedProviders] = useState<FeedProvider[]>([]);
  const [feedProviderId, setFeedProviderId] = useState<string>(preset?.feedProviderId ?? "");
  const [comboId, setComboId] = useState<string>(preset?.comboId ?? "");
  const [creativeDefaults, setCreativeDefaults] = useState(
    preset?.creativeDefaults ?? { adStatus: "PAUSED" as "ACTIVE" | "PAUSED", brandName: "", callToAction: "" }
  );

  useEffect(() => {
    setPixels(loadPixels());
    setFeedProviders(loadFeedProviders());
  }, []);

  const selectedProvider = feedProviders.find((p) => p.id === feedProviderId);
  const comboOptions = selectedProvider?.combos ?? [];

  const pixelOptions = pixels.map((p) => ({ value: p.pixelId, label: p.name }));

  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<PresetFormValues>({
    resolver: zodResolver(presetFormSchema),
    defaultValues: preset
      ? {
          presetName: preset.name,
          campaign: {
            startImmediate: !preset.campaign.startDate,
            hasEndDate: !!preset.campaign.endDate,
            objective: preset.campaign.objective,
            status: preset.campaign.status,
            startDate: preset.campaign.startDate,
            endDate: preset.campaign.endDate,
            spendCapType: preset.campaign.spendCapType,
            dailyBudgetUsd: preset.campaign.dailyBudgetUsd,
            lifetimeBudgetUsd: preset.campaign.lifetimeBudgetUsd,
          },
          adSquads: preset.adSquads.map((sq) => ({
            startImmediate: !sq.startDate,
            hasEndDate: !!sq.endDate,
            type: sq.type,
            geoCountryCodes: (sq as { geoCountryCodes?: string[]; geoCountryCode?: string }).geoCountryCodes ?? [(sq as { geoCountryCodes?: string[]; geoCountryCode?: string }).geoCountryCode ?? "US"],
            optimizationGoal: sq.optimizationGoal,
            bidStrategy: sq.bidStrategy,
            bidAmountUsd: sq.bidAmountUsd,
            spendCapType: sq.spendCapType,
            dailyBudgetUsd: sq.dailyBudgetUsd,
            lifetimeBudgetUsd: sq.lifetimeBudgetUsd,
            status: sq.status,
            startDate: sq.startDate,
            endDate: sq.endDate,
            placementConfig: sq.placementConfig,
            targetingGender: sq.targetingGender,
            targetingDeviceType: sq.targetingDeviceType,
            targetingOsType: sq.targetingOsType,
            pixelId: sq.pixelId,
          })),
        }
      : {
          presetName: "",
          campaign: {
            startImmediate: true,
            hasEndDate: false,
            objective: "SALES",
            status: "PAUSED",
            spendCapType: "NO_BUDGET",
          },
          adSquads: [defaultAdSquad()],
        },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "adSquads" });

  const campaignSpendCapType = useWatch({ control, name: "campaign.spendCapType" });
  const campaignStartImmediate = useWatch({ control, name: "campaign.startImmediate" });
  const campaignHasEndDate = useWatch({ control, name: "campaign.hasEndDate" });

  const onSubmit = (data: PresetFormValues) => {
    const { startImmediate: csi, hasEndDate: ched, ...campaignRest } = data.campaign;

    const saved: CampaignPreset = {
      id: preset?.id ?? uuid(),
      name: data.presetName,
      feedProviderId,
      comboId: comboId || undefined,
      createdAt: preset?.createdAt ?? new Date().toISOString(),
      campaign: {
        ...campaignRest,
        startDate: csi ? undefined : campaignRest.startDate,
        endDate: ched ? campaignRest.endDate : undefined,
      },
      adSquads: data.adSquads.map(({ startImmediate, hasEndDate, ...sq }) => ({
        ...sq,
        startDate: startImmediate ? undefined : sq.startDate,
        endDate: hasEndDate ? sq.endDate : undefined,
        pixelId: sq.pixelId || undefined,
      })),
      creativeDefaults: {
        adStatus: creativeDefaults.adStatus,
        brandName: creativeDefaults.brandName || undefined,
        callToAction: creativeDefaults.callToAction || undefined,
      },
    };
    upsertPreset(saved);
    router.push("/dashboard/presets");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Preset identity */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Preset Identity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <Input
            label="Preset Name"
            placeholder="My Default Campaign Template"
            {...register("presetName")}
            error={errors.presetName?.message}
          />
        </div>

        {/* Feed Provider */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Feed Provider</label>
            <select
              value={feedProviderId}
              onChange={(e) => { setFeedProviderId(e.target.value); setComboId(""); }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select provider —</option>
              {feedProviders.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {!feedProviderId && (
              <p className="text-xs text-amber-600 mt-1">Assign a feed provider so this preset appears in the wizard.</p>
            )}
          </div>

          {comboOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Combo (optional)</label>
              <select
                value={comboId}
                onChange={(e) => setComboId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— None —</option>
                {comboOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Campaign defaults */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Campaign Defaults</h3>

        <input type="hidden" {...register("campaign.objective")} value="SALES" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            {...register("campaign.status")}
          />
        </div>

        {/* Start date */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
              {...register("campaign.startImmediate", {
                onChange: (e) => {
                  if (!e.target.checked) {
                    setValue("campaign.startDate", todayIso());
                  }
                },
              })}
            />
            <span className="text-sm font-medium text-gray-700">Launch immediately</span>
          </label>
          {!campaignStartImmediate && (
            <Input
              label="Start Date"
              type="date"
              {...register("campaign.startDate")}
              error={errors.campaign?.startDate?.message}
            />
          )}
        </div>

        {/* End date */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
              {...register("campaign.hasEndDate")}
            />
            <span className="text-sm font-medium text-gray-700">Set an end date</span>
          </label>
          {campaignHasEndDate && (
            <Input
              label="End Date"
              type="date"
              {...register("campaign.endDate")}
              error={errors.campaign?.endDate?.message}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Budget Type"
            options={CAMPAIGN_SPEND_CAP_OPTIONS}
            {...register("campaign.spendCapType", {
              onChange: () => {
                setValue("campaign.dailyBudgetUsd", undefined);
                setValue("campaign.lifetimeBudgetUsd", undefined);
              },
            })}
          />
          {campaignSpendCapType === "DAILY_BUDGET" && (
            <Input
              label="Daily Budget (USD)"
              type="number"
              min={20}
              step={1}
              placeholder="Min $20"
              {...register("campaign.dailyBudgetUsd", { valueAsNumber: true })}
              error={errors.campaign?.dailyBudgetUsd?.message}
            />
          )}
        </div>
      </div>

      {/* Creative defaults */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Creative Defaults</h3>
        <p className="text-xs text-gray-500">Applied to every creative when using this preset in the wizard.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ad Status</label>
            <select
              value={creativeDefaults.adStatus}
              onChange={(e) => setCreativeDefaults((d) => ({ ...d, adStatus: e.target.value as "ACTIVE" | "PAUSED" }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="PAUSED">Paused</option>
              <option value="ACTIVE">Active</option>
            </select>
          </div>
          <Input
            label="Brand Name"
            placeholder="e.g. Amphy"
            maxLength={25}
            value={creativeDefaults.brandName ?? ""}
            onChange={(e) => setCreativeDefaults((d) => ({ ...d, brandName: e.target.value }))}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Call to Action</label>
            <select
              value={creativeDefaults.callToAction ?? ""}
              onChange={(e) => setCreativeDefaults((d) => ({ ...d, callToAction: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CTA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Ad set templates */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-800">Ad Set Templates</h3>
        {typeof errors.adSquads === "object" && "message" in errors.adSquads && (
          <p className="text-xs text-red-600">{(errors.adSquads as { message?: string }).message}</p>
        )}
        {fields.map((field, i) => (
          <AdSquadCard
            key={field.id}
            index={i}
            control={control}
            register={register}
            errors={errors}
            setValue={setValue}
            pixelOptions={pixelOptions}
            canRemove={fields.length > 1}
            onRemove={() => remove(i)}
            onDuplicate={() => append({ ...getValues(`adSquads.${i}`) })}
          />
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => append(defaultAdSquad())}
        >
          + Add Ad Set Template
        </Button>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/dashboard/presets")}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg">
          {preset ? "Update Preset" : "Save Preset"}
        </Button>
      </div>
    </form>
  );
}
