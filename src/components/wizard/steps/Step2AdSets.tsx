"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWizardStore } from "@/hooks/useWizardStore";
import { adSquadsFormSchema } from "@/lib/validations/adsquad.schema";
import { Input, Select, Button } from "@/components/ui";
import { v4 as uuid } from "uuid";
import type { AdSquadFormData } from "@/types/wizard";

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

export function Step2AdSets() {
  const { campaigns, adSquads, setAdSquads, setStep } = useWizardStore();

  const campaignOptions = campaigns.map((c) => ({ value: c.id, label: c.name || `Campaign #${campaigns.indexOf(c) + 1}` }));

  const { register, control, handleSubmit, formState: { errors } } = useForm<{
    adSquads: AdSquadFormData[];
  }>({
    resolver: zodResolver(adSquadsFormSchema),
    defaultValues: {
      adSquads: adSquads.length > 0
        ? adSquads
        : [{
            id: uuid(),
            campaignId: campaigns[0]?.id ?? "",
            name: "",
            type: "SNAP_ADS",
            geoCountryCode: "US",
            optimizationGoal: "IMPRESSIONS",
            bidStrategy: "AUTO_BID",
            dailyBudgetUsd: 50,
            status: "ACTIVE",
          }],
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
        <div key={field.id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Ad Set #{i + 1}</h3>
            {fields.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
                ✕ Remove
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Ad Set Name"
              placeholder="Retargeting - US"
              {...register(`adSquads.${i}.name`)}
              error={errors.adSquads?.[i]?.name?.message}
            />
            <Select
              label="Campaign"
              options={campaignOptions}
              placeholder="Select campaign"
              {...register(`adSquads.${i}.campaignId`)}
              error={errors.adSquads?.[i]?.campaignId?.message}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Geo Targeting"
              options={COUNTRY_OPTIONS}
              {...register(`adSquads.${i}.geoCountryCode`)}
              error={errors.adSquads?.[i]?.geoCountryCode?.message}
            />
            <Select
              label="Optimization Goal"
              options={OPTIMIZATION_OPTIONS}
              {...register(`adSquads.${i}.optimizationGoal`)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Bid Strategy"
              options={BID_STRATEGY_OPTIONS}
              {...register(`adSquads.${i}.bidStrategy`)}
            />
            <Input
              label="Daily Budget (USD)"
              type="number"
              min={5}
              step={1}
              {...register(`adSquads.${i}.dailyBudgetUsd`, { valueAsNumber: true })}
              error={errors.adSquads?.[i]?.dailyBudgetUsd?.message}
            />
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              {...register(`adSquads.${i}.status`)}
            />
          </div>

          <input type="hidden" {...register(`adSquads.${i}.id`)} />
          <input type="hidden" {...register(`adSquads.${i}.type`)} value="SNAP_ADS" />
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          append({
            id: uuid(),
            campaignId: campaigns[0]?.id ?? "",
            name: "",
            type: "SNAP_ADS",
            geoCountryCode: "US",
            optimizationGoal: "IMPRESSIONS",
            bidStrategy: "AUTO_BID",
            dailyBudgetUsd: 50,
            status: "ACTIVE",
          })
        }
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
