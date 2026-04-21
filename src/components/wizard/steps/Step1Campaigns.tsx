"use client";

import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWizardStore } from "@/hooks/useWizardStore";
import { campaignsFormSchema } from "@/lib/validations/campaign.schema";
import { Input, Select, Button } from "@/components/ui";
import { v4 as uuid } from "uuid";
import type { CampaignFormData } from "@/types/wizard";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
];

const SPEND_CAP_OPTIONS = [
  { value: "NO_BUDGET", label: "No Campaign Budget" },
  { value: "DAILY_BUDGET", label: "Daily Budget" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultCampaign(): CampaignFormData {
  return {
    id: uuid(),
    name: "",
    objective: "SALES",
    status: "PAUSED",
    startDate: todayIso(),
    endDate: "",
    spendCapType: "NO_BUDGET",
  };
}

function CampaignCard({
  index,
  control,
  register,
  errors,
  setValue,
  canRemove,
  onRemove,
  onDuplicate,
}: {
  index: number;
  control: ReturnType<typeof useForm<{ campaigns: CampaignFormData[] }>>["control"];
  register: ReturnType<typeof useForm<{ campaigns: CampaignFormData[] }>>["register"];
  errors: ReturnType<typeof useForm<{ campaigns: CampaignFormData[] }>>["formState"]["errors"];
  setValue: ReturnType<typeof useForm<{ campaigns: CampaignFormData[] }>>["setValue"];
  canRemove: boolean;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const spendCapType = useWatch({ control, name: `campaigns.${index}.spendCapType` });
  const campErrors = errors.campaigns?.[index];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Campaign #{index + 1}</h3>
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
        <Input
          label="Campaign Name"
          placeholder="Summer Sale 2026"
          {...register(`campaigns.${index}.name`)}
          error={campErrors?.name?.message}
        />
      </div>
      <input type="hidden" {...register(`campaigns.${index}.objective`)} value="SALES" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          label="Start Date"
          type="date"
          {...register(`campaigns.${index}.startDate`)}
          error={campErrors?.startDate?.message}
        />
        <Input
          label="End Date (optional)"
          type="date"
          {...register(`campaigns.${index}.endDate`)}
        />
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          {...register(`campaigns.${index}.status`)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Select
          label="Budget Type"
          options={SPEND_CAP_OPTIONS}
          {...register(`campaigns.${index}.spendCapType`, {
            onChange: () => {
              setValue(`campaigns.${index}.dailyBudgetUsd`, undefined);
              setValue(`campaigns.${index}.lifetimeBudgetUsd`, undefined);
            },
          })}
        />
        {spendCapType === "DAILY_BUDGET" && (
          <Input
            label="Daily Budget (USD)"
            type="number"
            min={20}
            step={1}
            placeholder="Min $20"
            {...register(`campaigns.${index}.dailyBudgetUsd`, { valueAsNumber: true })}
            error={campErrors?.dailyBudgetUsd?.message}
          />
        )}
      </div>

      <input type="hidden" {...register(`campaigns.${index}.id`)} />
    </div>
  );
}

export function Step1Campaigns() {
  const { campaigns, setCampaigns, setStep } = useWizardStore();

  const { register, control, handleSubmit, getValues, setValue, formState: { errors } } = useForm<{
    campaigns: CampaignFormData[];
  }>({
    resolver: zodResolver(campaignsFormSchema),
    defaultValues: {
      campaigns: campaigns.length > 0
        ? campaigns
        : [defaultCampaign()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "campaigns" });

  const onNext = (data: { campaigns: CampaignFormData[] }) => {
    setCampaigns(data.campaigns);
    setStep(2);
  };

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      {fields.map((field, i) => (
        <CampaignCard
          key={field.id}
          index={i}
          control={control}
          register={register}
          errors={errors}
          setValue={setValue}
          canRemove={fields.length > 1}
          onRemove={() => remove(i)}
          onDuplicate={() => append({ ...getValues(`campaigns.${i}`), id: uuid() })}
        />
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() => append(defaultCampaign())}
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
