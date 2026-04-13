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

/** Parse response as JSON; if the body isn't JSON (e.g. "Request Entity Too Large"), throw a readable error. */
async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }
}

/** Resize any image to 1080×1920 (9:16) with black letterboxing, returns a JPEG File. */
async function resizeImageForSnap(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const W = 1080, H = 1920;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const scale = Math.min(W / img.width, H / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Canvas resize failed")); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image load failed")); };
    img.src = objectUrl;
  });
}

const CHUNK_SIZE = 3 * 1024 * 1024; // 3 MB — fits within Vercel's 4.5 MB body limit

async function uploadVideoChunked(
  file: File,
  mediaId: string,
  onProgress: (msg: string) => void
): Promise<void> {
  const numChunks = Math.ceil(file.size / CHUNK_SIZE);

  // INIT
  onProgress("Initializing chunked upload...");
  const initRes = await fetch("/api/snapchat/media/upload-init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaId, fileName: file.name, fileSize: file.size, numberOfParts: numChunks }),
  });
  const initData = await safeJson(initRes);
  if (initData.error) throw new Error(initData.error);
  const { upload_id, add_path, finalize_path } = initData;

  // ADD each chunk sequentially
  for (let i = 0; i < numChunks; i++) {
    onProgress(`Uploading part ${i + 1} of ${numChunks}...`);
    const start = i * CHUNK_SIZE;
    const chunk = file.slice(start, start + CHUNK_SIZE);

    const chunkForm = new FormData();
    chunkForm.append("chunk", new File([chunk], file.name));
    chunkForm.append("partNumber", String(i + 1));
    chunkForm.append("uploadId", upload_id);
    chunkForm.append("addPath", add_path);

    const chunkRes = await fetch("/api/snapchat/media/upload-chunk", {
      method: "POST",
      body: chunkForm,
    });
    const chunkData = await safeJson(chunkRes);
    if (chunkData.error) throw new Error(chunkData.error);
  }

  // FINALIZE
  onProgress("Finalizing upload...");
  const finalRes = await fetch("/api/snapchat/media/upload-finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: upload_id, finalizePath: finalize_path }),
  });
  const finalData = await safeJson(finalRes);
  if (finalData.error) throw new Error(finalData.error);
}

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
    let file = accepted[0];
    if (!file) return;

    setStatus("uploading");

    try {
      const isVideo = file.type.startsWith("video/");
      const mediaType = isVideo ? "VIDEO" : "IMAGE";

      // Auto-resize images to 1080×1920 to meet Snapchat's requirements
      if (!isVideo) {
        setProgress("Resizing image to 1080×1920...");
        file = await resizeImageForSnap(file);
      }

      setProgress("Creating media entity...");
      const entityRes = await fetch("/api/snapchat/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId, name: file.name, type: mediaType }),
      });
      const entityData = await safeJson(entityRes);
      if (entityData.error) throw new Error(entityData.error);
      const { mediaId } = entityData;

      if (isVideo) {
        // Videos: chunked multipart upload to bypass Vercel's 4.5 MB body limit
        await uploadVideoChunked(file, mediaId, (msg) => setProgress(msg));
      } else {
        // Images: single-shot upload (already resized to ~1 MB JPEG)
        setProgress("Uploading image...");
        const form = new FormData();
        form.append("file", file);
        form.append("mediaId", mediaId);
        form.append("adAccountId", adAccountId);
        const uploadRes = await fetch("/api/snapchat/media/upload", {
          method: "POST",
          body: form,
        });
        const uploadData = await safeJson(uploadRes);
        if (uploadData.error) throw new Error(uploadData._debug ? `${uploadData.error} | debug: ${JSON.stringify(uploadData._debug)}` : uploadData.error);
      }

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
            <p className="text-xs text-gray-400 mt-1">PNG/JPG (auto-resized to 1080×1920) · MP4/MOV any size · chunked upload</p>
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
