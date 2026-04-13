"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWizardStore } from "@/hooks/useWizardStore";
import { adSquadsFormSchema } from "@/lib/validations/adsquad.schema";
import { loadPixels } from "@/lib/pixels";
import { Input, Select, Button } from "@/components/ui";
import { v4 as uuid } from "uuid";
import Link from "next/link";
import type { AdSquadFormData } from "@/types/wizard";
import type { SavedPixel } from "@/types/pixel";

const OPTIMIZATION_OPTIONS = [
  { value: "IMPRESSIONS", label: "Impressions" },
  { value: "SWIPES", label: "Swipes" },
  { value: "APP_INSTALLS", label: "App Installs" },
  { value: "LEAD_GENERATION", label: "Lead Generation" },
  { value: "PIXEL_PAGE_VIEW", label: "Pixel Page View" },
  { value: "PIXEL_PURCHASE", label: "Pixel Purchase" },
];

const BID_STRATEGY_OPTIONS = [
  { value: "AUTO_BID", label: "Auto Bid" },
  { value: "LOWEST_COST_WITH_MAX_BID", label: "Lowest Cost with Max Bid" },
  { value: "TARGET_COST", label: "Target Cost" },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
];

const COUNTRY_OPTIONS = [
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

const SPEND_CAP_OPTIONS = [
  { value: "DAILY_BUDGET", label: "Daily Budget" },
  { value: "LIFETIME_BUDGET", label: "Lifetime Budget" },
];

const PACING_OPTIONS = [
  { value: "STANDARD", label: "Standard" },
  { value: "ACCELERATED", label: "Accelerated" },
];

const PLACEMENT_OPTIONS = [
  { value: "AUTOMATIC", label: "Automatic" },
  { value: "CONTENT", label: "Content" },
];

const FREQUENCY_PERIOD_OPTIONS = [
  { value: "", label: "— None —" },
  { value: "HOURS_1", label: "1 Hour" },
  { value: "HOURS_6", label: "6 Hours" },
  { value: "HOURS_12", label: "12 Hours" },
  { value: "DAY_1", label: "1 Day" },
  { value: "DAY_7", label: "7 Days" },
  { value: "MONTH_1", label: "1 Month" },
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

function defaultAdSquad(campaignId: string): AdSquadFormData {
  return {
    id: uuid(),
    campaignId,
    name: "",
    type: "SNAP_ADS",
    geoCountryCode: "US",
    optimizationGoal: "SWIPES",
    bidStrategy: "AUTO_BID",
    spendCapType: "DAILY_BUDGET",
    dailyBudgetUsd: 5,
    status: "PAUSED",
    pacingType: "STANDARD",
    placementConfig: "AUTOMATIC",
    targetingGender: "ALL",
    targetingDeviceType: "ALL",
    pixelId: "",
  };
}

function AdSetCard({
  index,
  control,
  register,
  errors,
  setValue,
  campaignOptions,
  pixelOptions,
  canRemove,
  onRemove,
  onDuplicate,
}: {
  index: number;
  control: ReturnType<typeof useForm<{ adSquads: AdSquadFormData[] }>>["control"];
  register: ReturnType<typeof useForm<{ adSquads: AdSquadFormData[] }>>["register"];
  errors: ReturnType<typeof useForm<{ adSquads: AdSquadFormData[] }>>["formState"]["errors"];
  setValue: ReturnType<typeof useForm<{ adSquads: AdSquadFormData[] }>>["setValue"];
  campaignOptions: Array<{ value: string; label: string }>;
  pixelOptions: Array<{ value: string; label: string }>;
  canRemove: boolean;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const bidStrategy = useWatch({ control, name: `adSquads.${index}.bidStrategy` });
  const spendCapType = useWatch({ control, name: `adSquads.${index}.spendCapType` });
  const squadErrors = errors.adSquads?.[index];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Ad Set #{index + 1}</h3>
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

      {/* Name + Campaign */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Ad Set Name"
          placeholder="Retargeting - US"
          {...register(`adSquads.${index}.name`)}
          error={squadErrors?.name?.message}
        />
        <Select
          label="Campaign"
          options={campaignOptions}
          placeholder="Select campaign"
          {...register(`adSquads.${index}.campaignId`)}
          error={squadErrors?.campaignId?.message}
        />
      </div>

      {/* Geo + Optimization goal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Geo Targeting"
          options={COUNTRY_OPTIONS}
          {...register(`adSquads.${index}.geoCountryCode`)}
          error={squadErrors?.geoCountryCode?.message}
        />
        <Select
          label="Optimization Goal"
          options={OPTIMIZATION_OPTIONS}
          {...register(`adSquads.${index}.optimizationGoal`)}
        />
      </div>

      {/* Bid strategy + bid amount + status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Select
          label="Bid Strategy"
          options={BID_STRATEGY_OPTIONS}
          {...register(`adSquads.${index}.bidStrategy`, {
            onChange: () => setValue(`adSquads.${index}.bidAmountUsd`, undefined),
          })}
        />
        {bidStrategy !== "AUTO_BID" && (
          <Input
            label="Bid Amount (USD)"
            type="number"
            min={0.01}
            step={0.01}
            {...register(`adSquads.${index}.bidAmountUsd`, { valueAsNumber: true })}
            error={squadErrors?.bidAmountUsd?.message}
          />
        )}
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          {...register(`adSquads.${index}.status`)}
        />
      </div>

      {/* Budget type + budget + pacing */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Select
          label="Budget Type"
          options={SPEND_CAP_OPTIONS}
          {...register(`adSquads.${index}.spendCapType`, {
            onChange: () => {
              setValue(`adSquads.${index}.dailyBudgetUsd`, undefined);
              setValue(`adSquads.${index}.lifetimeBudgetUsd`, undefined);
            },
          })}
        />
        {spendCapType === "DAILY_BUDGET" || !spendCapType ? (
          <Input
            label="Daily Budget (USD)"
            type="number"
            min={5}
            step={1}
            {...register(`adSquads.${index}.dailyBudgetUsd`, { valueAsNumber: true })}
            error={squadErrors?.dailyBudgetUsd?.message}
          />
        ) : (
          <Input
            label="Lifetime Budget (USD)"
            type="number"
            min={5}
            step={1}
            {...register(`adSquads.${index}.lifetimeBudgetUsd`, { valueAsNumber: true })}
            error={squadErrors?.lifetimeBudgetUsd?.message}
          />
        )}
        <Select
          label="Pacing"
          options={PACING_OPTIONS}
          {...register(`adSquads.${index}.pacingType`)}
        />
      </div>

      {/* Placement + ad-set dates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Select
          label="Placement"
          options={PLACEMENT_OPTIONS}
          {...register(`adSquads.${index}.placementConfig`)}
        />
        <Input
          label="Ad Set Start Date (optional)"
          type="date"
          {...register(`adSquads.${index}.startDate`)}
        />
        <Input
          label="Ad Set End Date (optional)"
          type="date"
          {...register(`adSquads.${index}.endDate`)}
        />
      </div>

      {/* Tracking */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Tracking
        </p>
        {pixelOptions.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No pixels configured.{" "}
            <Link href="/dashboard/pixels" className="underline font-medium">
              Add a pixel
            </Link>{" "}
            before creating ad sets.
          </p>
        ) : (
          <div className="max-w-sm">
            <Select
              label="Snap Pixel"
              options={pixelOptions}
              placeholder="Select a pixel"
              {...register(`adSquads.${index}.pixelId`)}
              error={squadErrors?.pixelId?.message}
            />
          </div>
        )}
      </div>

      {/* Frequency cap */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Frequency Cap <span className="font-normal normal-case">(optional)</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Max Impressions per User"
            type="number"
            min={1}
            step={1}
            placeholder="e.g. 3"
            {...register(`adSquads.${index}.frequencyCapMaxImpressions`, { valueAsNumber: true })}
            error={squadErrors?.frequencyCapMaxImpressions?.message}
          />
          <Select
            label="Per Time Period"
            options={FREQUENCY_PERIOD_OPTIONS}
            {...register(`adSquads.${index}.frequencyCapTimePeriod`)}
            error={squadErrors?.frequencyCapTimePeriod?.message}
          />
        </div>
      </div>

      {/* Audience targeting */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Audience Targeting <span className="font-normal normal-case">(optional)</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Input
            label="Min Age"
            type="number"
            min={13}
            max={50}
            step={1}
            placeholder="13"
            {...register(`adSquads.${index}.targetingAgeMin`, { valueAsNumber: true })}
            error={squadErrors?.targetingAgeMin?.message}
          />
          <Input
            label="Max Age"
            type="number"
            min={13}
            max={50}
            step={1}
            placeholder="50"
            {...register(`adSquads.${index}.targetingAgeMax`, { valueAsNumber: true })}
            error={squadErrors?.targetingAgeMax?.message}
          />
          <Select
            label="Gender"
            options={GENDER_OPTIONS}
            {...register(`adSquads.${index}.targetingGender`)}
          />
          <Select
            label="Device"
            options={DEVICE_OPTIONS}
            {...register(`adSquads.${index}.targetingDeviceType`)}
          />
        </div>
      </div>

      <input type="hidden" {...register(`adSquads.${index}.id`)} />
      <input type="hidden" {...register(`adSquads.${index}.type`)} value="SNAP_ADS" />
    </div>
  );
}

export function Step2AdSets() {
  const { campaigns, adSquads, setAdSquads, setStep } = useWizardStore();
  const [pixels, setPixels] = useState<SavedPixel[]>([]);

  useEffect(() => {
    setPixels(loadPixels());
  }, []);

  const pixelOptions = pixels.map((p) => ({ value: p.pixelId, label: p.name }));

  const campaignOptions = campaigns.map((c, idx) => ({
    value: c.id,
    label: c.name || `Campaign #${idx + 1}`,
  }));

  const { register, control, handleSubmit, getValues, setValue, formState: { errors } } = useForm<{
    adSquads: AdSquadFormData[];
  }>({
    resolver: zodResolver(adSquadsFormSchema),
    defaultValues: {
      adSquads: adSquads.length > 0
        ? adSquads
        : [defaultAdSquad(campaigns[0]?.id ?? "")],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "adSquads" });

  const onNext = (data: { adSquads: AdSquadFormData[] }) => {
    setAdSquads(data.adSquads);
    setStep(3);
  };

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      {fields.map((field, i) => (
        <AdSetCard
          key={field.id}
          index={i}
          control={control}
          register={register}
          errors={errors}
          setValue={setValue}
          campaignOptions={campaignOptions}
          pixelOptions={pixelOptions}
          canRemove={fields.length > 1}
          onRemove={() => remove(i)}
          onDuplicate={() =>
            append({ ...getValues(`adSquads.${i}`), id: uuid() })
          }
        />
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() => append(defaultAdSquad(campaigns[0]?.id ?? ""))}
      >
        + Add Another Ad Set
      </Button>

      <div className="flex justify-between">
        <Button type="button" variant="secondary" onClick={() => setStep(1)}>
          ← Back
        </Button>
        <Button type="submit" size="lg">
          Next: Creatives →
        </Button>
      </div>
    </form>
  );
}
