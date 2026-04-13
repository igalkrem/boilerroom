"use client";

import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWizardStore } from "@/hooks/useWizardStore";
import { creativesFormSchema } from "@/lib/validations/creative.schema";
import { Input, Select, Button, Alert } from "@/components/ui";
import { useDropzone } from "react-dropzone";
import { v4 as uuid } from "uuid";
import { useState } from "react";
import { clsx } from "clsx";
import { z } from "zod";
import type { CreativeFormData } from "@/types/wizard";

type CreativesFormValues = z.infer<typeof creativesFormSchema>;

const CTA_OPTIONS = [
  { value: "", label: "None" },
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "INSTALL_NOW", label: "Install Now" },
  { value: "WATCH", label: "Watch" },
];

function MediaDropzone({
  adAccountId,
  onUploaded,
}: {
  adAccountId: string;
  onUploaded: (mediaId: string, fileName: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [progress, setProgress] = useState<string>("");

  const onDrop = async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;

    setStatus("uploading");
    setProgress("Creating media entity...");

    try {
      const isVideo = file.type.startsWith("video/");
      const mediaType = isVideo ? "VIDEO" : "IMAGE";

      // Step 1: Create media entity
      const entityRes = await fetch("/api/snapchat/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId, name: file.name, type: mediaType }),
      });
      const { mediaId, uploadUrl, error: entityError } = await entityRes.json();
      if (entityError) throw new Error(entityError);

      setProgress("Uploading file...");

      // Step 2: Upload file — use Snapchat's upload_url (S3) if provided, else largefile endpoint
      const form = new FormData();
      form.append("file", file);
      form.append("mediaId", mediaId);
      form.append("adAccountId", adAccountId);
      if (uploadUrl) form.append("uploadUrl", uploadUrl);

      const uploadRes = await fetch("/api/snapchat/media/upload", {
        method: "POST",
        body: form,
      });
      const uploadData = await uploadRes.json();
      if (uploadData.error) throw new Error(uploadData.error);

      setStatus("done");
      setProgress("");
      onUploaded(mediaId, file.name);
    } catch (err) {
      setStatus("error");
      setProgress(String(err));
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [], "video/*": [] },
    maxFiles: 1,
    disabled: status === "uploading" || status === "done",
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={clsx(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          isDragActive ? "border-yellow-400 bg-yellow-50" : "border-gray-300 hover:border-gray-400",
          (status === "uploading" || status === "done") && "cursor-default opacity-75"
        )}
      >
        <input {...getInputProps()} />
        {status === "idle" && (
          <>
            <div className="text-3xl mb-2">↑</div>
            <p className="text-sm text-gray-600">Drag & drop image or video here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">PNG, JPG, MP4 · max 50MB</p>
          </>
        )}
        {status === "uploading" && (
          <p className="text-sm text-gray-600 animate-pulse">{progress}</p>
        )}
        {status === "done" && (
          <p className="text-sm text-green-600 font-medium">✅ Upload complete</p>
        )}
      </div>
      {status === "error" && (
        <Alert type="error" className="mt-2">{progress}</Alert>
      )}
    </div>
  );
}

export function Step3Creatives({ adAccountId }: { adAccountId: string }) {
  const { adSquads, creatives, setCreatives, setStep } = useWizardStore();

  const adSquadOptions = adSquads.map((sq, i) => ({
    value: sq.id,
    label: sq.name || `Ad Set #${i + 1}`,
  }));

  const { register, control, handleSubmit, setValue, formState: { errors } } = useForm<CreativesFormValues>({
    resolver: zodResolver(creativesFormSchema),
    defaultValues: {
      creatives: creatives.length > 0
        ? creatives
        : [{
            id: uuid(),
            adSquadId: adSquads[0]?.id ?? "",
            name: "",
            headline: "",
            brandName: "",
            callToAction: "",
            mediaId: "",
            mediaFileName: "",
            uploadStatus: "idle",
          }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "creatives" });

  const onNext = (data: CreativesFormValues) => {
    setCreatives(data.creatives as CreativeFormData[]);
    setStep(4);
  };

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      {fields.map((field, i) => (
        <div key={field.id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Creative #{i + 1}</h3>
            {fields.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
                ✕ Remove
              </Button>
            )}
          </div>

          <Controller
            control={control}
            name={`creatives.${i}.mediaId`}
            render={({ field: f }) => (
              <div>
                <MediaDropzone
                  adAccountId={adAccountId}
                  onUploaded={(mediaId, fileName) => {
                    f.onChange(mediaId);
                    setValue(`creatives.${i}.mediaFileName`, fileName);
                    setValue(`creatives.${i}.uploadStatus`, "done");
                  }}
                />
                {errors.creatives?.[i]?.mediaId && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.creatives[i]?.mediaId?.message}
                  </p>
                )}
              </div>
            )}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Creative Name"
              placeholder="Summer Banner"
              {...register(`creatives.${i}.name`)}
              error={errors.creatives?.[i]?.name?.message}
            />
            <Input
              label={`Headline (max 34 chars)`}
              placeholder="Shop the Sale Now"
              maxLength={34}
              {...register(`creatives.${i}.headline`)}
              error={errors.creatives?.[i]?.headline?.message}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Brand Name (optional)"
              placeholder="Acme Corp"
              maxLength={25}
              {...register(`creatives.${i}.brandName`)}
            />
            <Select
              label="Call to Action"
              options={CTA_OPTIONS}
              {...register(`creatives.${i}.callToAction`)}
            />
            <Select
              label="Ad Set"
              options={adSquadOptions}
              placeholder="Select ad set"
              {...register(`creatives.${i}.adSquadId`)}
              error={errors.creatives?.[i]?.adSquadId?.message}
            />
          </div>

          <input type="hidden" {...register(`creatives.${i}.id`)} />
          <input type="hidden" {...register(`creatives.${i}.uploadStatus`)} />
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          append({
            id: uuid(),
            adSquadId: adSquads[0]?.id ?? "",
            name: "",
            headline: "",
            brandName: "",
            callToAction: "",
            mediaId: "",
            mediaFileName: "",
            uploadStatus: "idle",
          })
        }
      >
        + Add Another Creative
      </Button>

      <div className="flex justify-between">
        <Button type="button" variant="secondary" onClick={() => setStep(2)}>
          ← Back
        </Button>
        <Button type="submit" size="lg">
          Next: Review →
        </Button>
      </div>
    </form>
  );
}
