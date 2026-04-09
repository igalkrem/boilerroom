"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWizardStore } from "@/hooks/useWizardStore";
import { campaignsFormSchema } from "@/lib/validations/campaign.schema";
import { Input, Select, Button } from "@/components/ui";
import { v4 as uuid } from "uuid";
import type { CampaignFormData } from "@/types/wizard";

const OBJECTIVE_OPTIONS = [
  { value: "AWARENESS_AND_ENGAGEMENT", label: "Awareness & Engagement" },
  { value: "SALES", label: "Sales" },
  { value: "TRAFFIC", label: "Traffic" },
  { value: "APP_PROMOTION", label: "App Promotion" },
  { value: "LEADS", label: "Leads" },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
];

export function Step1Campaigns() {
  const { campaigns, setCampaigns, setStep } = useWizardStore();

  const { register, control, handleSubmit, formState: { errors } } = useForm<{
    campaigns: CampaignFormData[];
  }>({
    resolver: zodResolver(campaignsFormSchema),
    defaultValues: {
      campaigns: campaigns.length > 0
        ? campaigns
        : [{ id: uuid(), name: "", objective: "AWARENESS_AND_ENGAGEMENT", status: "ACTIVE", startDate: "", endDate: "", dailyBudgetUsd: 100 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "campaigns" });

  const onNext = (data: { campaigns: CampaignFormData[] }) => {
    setCampaigns(data.campaigns);
    setStep(2);
  };

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      <input type="hidden" {...register} />
      {fields.map((field, i) => (
        <div key={field.id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Campaign #{i + 1}</h3>
            {fields.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
                ✕ Remove
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Campaign Name"
              placeholder="Summer Sale 2026"
              {...register(`campaigns.${i}.name`)}
              error={errors.campaigns?.[i]?.name?.message}
            />
            <Select
              label="Objective"
              options={OBJECTIVE_OPTIONS}
              {...register(`campaigns.${i}.objective`)}
              error={errors.campaigns?.[i]?.objective?.message}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Start Date"
              type="date"
              {...register(`campaigns.${i}.startDate`)}
              error={errors.campaigns?.[i]?.startDate?.message}
            />
            <Input
              label="End Date (optional)"
              type="date"
              {...register(`campaigns.${i}.endDate`)}
            />
            <Input
              label="Daily Budget (USD)"
              type="number"
              min={1}
              step={1}
              {...register(`campaigns.${i}.dailyBudgetUsd`, { valueAsNumber: true })}
              error={errors.campaigns?.[i]?.dailyBudgetUsd?.message}
            />
          </div>

          <div className="w-40">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              {...register(`campaigns.${i}.status`)}
            />
          </div>

          <input type="hidden" {...register(`campaigns.${i}.id`)} />
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          append({
            id: uuid(),
            name: "",
            objective: "AWARENESS_AND_ENGAGEMENT",
            status: "ACTIVE",
            startDate: "",
            endDate: "",
            dailyBudgetUsd: 100,
          })
        }
      >
        + Add Another Campaign
      </Button>

      <div className="flex justify-end">
        <Button type="submit" size="lg">
          Next: Ad Sets →
        </Button>
      </div>
    </form>
  );
}
