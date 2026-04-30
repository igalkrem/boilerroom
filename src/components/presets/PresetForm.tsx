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
import { loadFeedProviders } from "@/lib/feed-providers";
import type { CampaignPreset } from "@/types/preset";
import type { SavedPixel } from "@/types/pixel";
import type { FeedProvider } from "@/types/feed-provider";

// ─── Schema ───────────────────────────────────────────────────────────────────

const presetFormSchema = z
  .object({
    presetName: z.string().min(1, "Preset name is required"),
    geoCountryCodes: z.array(z.string().min(2)).min(1, "Select at least one country"),
    optimizationGoal: z.enum([
      "PIXEL_PURCHASE", "PIXEL_SIGNUP", "PIXEL_ADD_TO_CART", "PIXEL_PAGE_VIEW", "LANDING_PAGE_VIEW",
    ]),
    bidStrategy: z.enum(["AUTO_BID", "LOWEST_COST_WITH_MAX_BID", "TARGET_COST"]),
    bidAmountUsd: z.number().optional(),
    dailyBudgetUsd: z.number().optional(),
    placementConfig: z.enum(["AUTOMATIC", "CONTENT"]),
    targetingDeviceType: z.enum(["WEB", "MOBILE", "ALL"]).optional(),
    targetingOsType: z.enum(["iOS", "ANDROID"]).optional(),
    pixelId: z.string().optional(),
    status: z.enum(["ACTIVE", "PAUSED"]),
  })
  .superRefine((data, ctx) => {
    if (data.bidStrategy !== "AUTO_BID" && (!data.bidAmountUsd || data.bidAmountUsd <= 0)) {
      ctx.addIssue({ code: "custom", path: ["bidAmountUsd"], message: "Bid amount required" });
    }
    if (!data.dailyBudgetUsd || data.dailyBudgetUsd < 5) {
      ctx.addIssue({ code: "custom", path: ["dailyBudgetUsd"], message: "Minimum $5" });
    }
  });

type PresetFormValues = z.infer<typeof presetFormSchema>;

// ─── Options ─────────────────────────────────────────────────────────────────

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

const selectCls =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white";

// ─── Component ────────────────────────────────────────────────────────────────

interface PresetFormProps {
  preset?: CampaignPreset;
}

export function PresetForm({ preset }: PresetFormProps) {
  const router = useRouter();

  const [trafficSource, setTrafficSource] = useState<"snap" | "facebook">(
    preset?.trafficSource ?? "snap"
  );
  const [feedProviderId, setFeedProviderId] = useState<string>(preset?.feedProviderId ?? "");
  const [comboId, setComboId] = useState<string>(preset?.comboId ?? "");
  const [adStatus, setAdStatus] = useState<"ACTIVE" | "PAUSED">(
    preset?.creativeDefaults?.adStatus ?? "PAUSED"
  );
  const [callToAction, setCallToAction] = useState<string>(
    preset?.creativeDefaults?.callToAction ?? ""
  );
  const [pixels, setPixels] = useState<SavedPixel[]>([]);
  const [feedProviders, setFeedProviders] = useState<FeedProvider[]>([]);

  useEffect(() => {
    setPixels(loadPixels());
    setFeedProviders(loadFeedProviders());
  }, []);

  const selectedProvider = feedProviders.find((p) => p.id === feedProviderId);
  const comboOptions = selectedProvider?.combos ?? [];
  const pixelOptions = pixels.map((p) => ({ value: p.pixelId, label: p.name }));

  const sq0 = preset?.adSquads?.[0];

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PresetFormValues>({
    resolver: zodResolver(presetFormSchema),
    defaultValues: sq0
      ? {
          presetName: preset!.name,
          geoCountryCodes:
            (sq0 as unknown as { geoCountryCodes?: string[]; geoCountryCode?: string })
              .geoCountryCodes ??
            [
              (sq0 as unknown as { geoCountryCodes?: string[]; geoCountryCode?: string })
                .geoCountryCode ?? "US",
            ],
          optimizationGoal: sq0.optimizationGoal,
          bidStrategy: sq0.bidStrategy,
          bidAmountUsd: sq0.bidAmountUsd,
          dailyBudgetUsd: sq0.dailyBudgetUsd,
          placementConfig: sq0.placementConfig,
          targetingDeviceType: sq0.targetingDeviceType,
          targetingOsType: sq0.targetingOsType,
          pixelId: sq0.pixelId,
          status: sq0.status,
        }
      : {
          presetName: "",
          geoCountryCodes: ["US"],
          optimizationGoal: "PIXEL_PURCHASE",
          bidStrategy: "AUTO_BID",
          dailyBudgetUsd: 20,
          placementConfig: "AUTOMATIC",
          targetingDeviceType: "ALL",
          status: "PAUSED",
        },
  });

  const bidStrategy = useWatch({ control, name: "bidStrategy" });
  const deviceType = useWatch({ control, name: "targetingDeviceType" });

  const onSubmit = (data: PresetFormValues) => {
    const saved: CampaignPreset = {
      id: preset?.id ?? uuid(),
      name: data.presetName,
      trafficSource,
      feedProviderId,
      comboId: comboId || undefined,
      createdAt: preset?.createdAt ?? new Date().toISOString(),
      campaign: {
        objective: "SALES",
        status: "ACTIVE",
        spendCapType: "NO_BUDGET",
        startDate: undefined,
        endDate: undefined,
      },
      adSquads: [
        {
          type: "SNAP_ADS",
          geoCountryCodes: data.geoCountryCodes,
          optimizationGoal: data.optimizationGoal,
          bidStrategy: data.bidStrategy,
          bidAmountUsd: data.bidAmountUsd,
          spendCapType: "DAILY_BUDGET",
          dailyBudgetUsd: data.dailyBudgetUsd,
          status: data.status,
          startDate: undefined,
          endDate: undefined,
          placementConfig: data.placementConfig,
          targetingGender: undefined,
          targetingDeviceType: data.targetingDeviceType,
          targetingOsType: data.targetingOsType,
          pixelId: data.pixelId || undefined,
        },
      ],
      creativeDefaults: {
        adStatus,
        callToAction: callToAction || undefined,
      },
    };
    upsertPreset(saved);
    router.push("/dashboard/presets");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-8">
      {/* Traffic Source */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Traffic Source</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTrafficSource("snap")}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
              trafficSource === "snap"
                ? "bg-yellow-400 border-yellow-400 text-gray-900"
                : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
            }`}
          >
            {trafficSource === "snap" && <span>✓</span>}
            Snap
          </button>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-400 cursor-not-allowed flex items-center gap-2"
          >
            Facebook
            <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
              soon
            </span>
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Feed Provider</label>
          <select
            value={feedProviderId}
            onChange={(e) => {
              setFeedProviderId(e.target.value);
              setComboId("");
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

        {comboOptions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Combo (optional)
            </label>
            <select
              value={comboId}
              onChange={(e) => setComboId(e.target.value)}
              className={selectCls}
            >
              <option value="">— None —</option>
              {comboOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <hr className="border-gray-100" />

      {/* Targeting */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="sm:col-span-2">
          <Controller
            control={control}
            name="geoCountryCodes"
            render={({ field }) => (
              <MultiSelect
                label="Geo Targeting"
                options={GEO_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                error={errors.geoCountryCodes?.message}
              />
            )}
          />
        </div>

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

        <Select label="Placements" options={PLACEMENT_OPTIONS} {...register("placementConfig")} />
      </div>

      <hr className="border-gray-100" />

      {/* Bidding & Tracking */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pixel (optional)</label>
          <select {...register("pixelId")} className={selectCls}>
            <option value="">— None —</option>
            {pixelOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

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
      </div>

      <hr className="border-gray-100" />

      {/* Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Select
          label="Ad Set Status"
          options={STATUS_OPTIONS}
          {...register("status")}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ad Status</label>
          <select
            value={adStatus}
            onChange={(e) => setAdStatus(e.target.value as "ACTIVE" | "PAUSED")}
            className={selectCls}
          >
            <option value="PAUSED">Paused</option>
            <option value="ACTIVE">Active</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Call to Action</label>
          <select
            value={callToAction}
            onChange={(e) => setCallToAction(e.target.value)}
            className={selectCls}
          >
            {CTA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
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
