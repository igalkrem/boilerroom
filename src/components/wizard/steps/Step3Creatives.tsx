"use client";

import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useWizardStore } from "@/hooks/useWizardStore";
import { creativesFormSchema } from "@/lib/validations/creative.schema";
import { Input, Select, Button, Alert } from "@/components/ui";
import { useDropzone } from "react-dropzone";
import { v4 as uuid } from "uuid";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { z } from "zod";
import type { CreativeFormData } from "@/types/wizard";

type CreativesFormValues = z.infer<typeof creativesFormSchema>;

const CTA_OPTIONS = [
  { value: "", label: "None" },
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

const AD_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
];

/**
 * Module-level map of creative id → processed File (transcoded/resized).
 * Populated in Step 3, consumed by the submission orchestrator in Step 4.
 * Keyed by the creative's UUID so duplicates (which get new IDs) start fresh.
 */
const pendingMediaFiles = new Map<string, File>();

import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegCache: FFmpeg | null = null;
// Track the active progress handler so we can remove it before registering a new one,
// preventing duplicate callbacks when the same FFmpeg instance handles multiple files.
let activeProgressHandler: ((event: { progress: number }) => void) | null = null;

async function getFFmpeg(onProgress: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegCache?.loaded) return ffmpegCache;

  onProgress("Loading video processor (one-time download ~30 MB)...");

  const { FFmpeg: FFmpegClass } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");

  const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  const ffmpeg = new FFmpegClass();

  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  });

  ffmpegCache = ffmpeg;
  return ffmpeg;
}

async function transcodeVideoForSnap(file: File, onProgress: (msg: string) => void): Promise<File> {
  const ffmpeg = await getFFmpeg(onProgress);
  const { fetchFile } = await import("@ffmpeg/util");

  const ext = file.name.split(".").pop() ?? "mp4";
  const inputName = `input.${ext}`;
  const outputName = "output.mp4";

  onProgress("Transcoding video to 720×1280 H.264...");

  // Remove stale handler from a prior call to prevent double-firing on the same FFmpeg instance
  if (activeProgressHandler) ffmpeg.off("progress", activeProgressHandler);
  activeProgressHandler = ({ progress }: { progress: number }) => {
    if (progress > 0) onProgress(`Transcoding: ${Math.round(progress * 100)}%...`);
  };
  ffmpeg.on("progress", activeProgressHandler);

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  // First attempt: transcode with source audio (works when input has an audio track)
  let exitCode = await ffmpeg.exec([
    "-i", inputName,
    "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",      // required by Snapchat (yuv420p only)
    "-profile:v", "main",       // H.264 Main profile for broad compatibility
    "-level", "4.0",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "44100",
    "-ac", "2",
    "-movflags", "+faststart",
    outputName,
  ]);

  // If source had no audio track, ffmpeg exits non-zero; retry with a silent audio track
  if (exitCode !== 0) {
    onProgress("No audio track detected — adding silence...");
    exitCode = await ffmpeg.exec([
      "-i", inputName,
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-profile:v", "main",
      "-level", "4.0",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      "-ac", "2",
      "-shortest",
      "-movflags", "+faststart",
      outputName,
    ]);
  }

  if (exitCode !== 0) {
    throw new Error("Video transcoding failed. Please check the file is a valid video.");
  }

  const data = await ffmpeg.readFile(outputName) as Uint8Array;
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

  return new File(
    [buffer],
    file.name.replace(/\.[^.]+$/, ".mp4"),
    { type: "video/mp4" }
  );
}

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

function MediaDropzone({
  onFileReady,
}: {
  onFileReady: (file: File, fileName: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [progress, setProgress] = useState<string>("");
  const [lastFile, setLastFile] = useState<File | null>(null);

  const processFile = async (file: File) => {
    setLastFile(file);
    setStatus("uploading");

    try {
      const isVideo = file.type.startsWith("video/");

      if (isVideo) {
        file = await transcodeVideoForSnap(file, (msg) => setProgress(msg));
      } else {
        setProgress("Resizing image to 1080×1920...");
        file = await resizeImageForSnap(file);
      }

      setStatus("done");
      setProgress("");
      onFileReady(file, file.name);
    } catch (err) {
      setStatus("error");
      setProgress(String(err));
    }
  };

  const onDrop = (accepted: File[]) => { if (accepted[0]) processFile(accepted[0]); };
  const retry = () => { if (lastFile) processFile(lastFile); };

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
            <p className="text-xs text-gray-400 mt-1">PNG/JPG (auto-resized to 1080×1920) · MP4/MOV (transcoded locally) · uploaded on submit</p>
          </>
        )}
        {status === "uploading" && (
          <p className="text-sm text-gray-600 animate-pulse">{progress}</p>
        )}
        {status === "done" && (
          <p className="text-sm text-green-600 font-medium">✅ Ready — will upload on submit</p>
        )}
      </div>
      {status === "error" && (
        <div className="mt-2 space-y-2">
          <Alert type="error">{progress}</Alert>
          <Button type="button" variant="secondary" size="sm" onClick={retry}>
            ↺ Retry upload
          </Button>
        </div>
      )}
    </div>
  );
}

function CreativeCard({
  index,
  creativeId,
  adSquadOptions,
  control,
  register,
  errors,
  setValue,
  canRemove,
  onRemove,
  onDuplicate,
}: {
  index: number;
  creativeId: string;
  adSquadOptions: Array<{ value: string; label: string }>;
  control: ReturnType<typeof useForm<CreativesFormValues>>["control"];
  register: ReturnType<typeof useForm<CreativesFormValues>>["register"];
  errors: ReturnType<typeof useForm<CreativesFormValues>>["formState"]["errors"];
  setValue: ReturnType<typeof useForm<CreativesFormValues>>["setValue"];
  canRemove: boolean;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const interactionType = useWatch({ control, name: `creatives.${index}.interactionType` });
  const creativeErrors = errors.creatives?.[index];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Creative #{index + 1}</h3>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDuplicate}
            title="Duplicate (media will need re-uploading)"
          >
            ⎘ Duplicate
          </Button>
          {canRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              ✕ Remove
            </Button>
          )}
        </div>
      </div>

      {/* Media upload */}
      <div>
        <MediaDropzone
          onFileReady={(file, fileName) => {
            pendingMediaFiles.set(creativeId, file);
            setValue(`creatives.${index}.mediaFileName`, fileName);
            setValue(`creatives.${index}.uploadStatus`, "done");
          }}
        />
        {creativeErrors?.mediaId && (
          <p className="text-xs text-red-600 mt-1">
            {creativeErrors.mediaId.message}
          </p>
        )}
      </div>

      {/* Conditional URL fields */}
      {interactionType === "WEB_VIEW" && (
        <Input
          label="Web View URL"
          placeholder="https://example.com/landing"
          type="url"
          {...register(`creatives.${index}.webViewUrl`)}
          error={creativeErrors?.webViewUrl?.message}
        />
      )}
      {(interactionType === "DEEP_LINK" || interactionType === "APP_INSTALL") && (
        <Input
          label={interactionType === "APP_INSTALL" ? "App Deep Link URL" : "Deep Link URL"}
          placeholder="myapp://page or https://apps.apple.com/..."
          {...register(`creatives.${index}.deepLinkUrl`)}
          error={creativeErrors?.deepLinkUrl?.message}
        />
      )}

      {/* Name + Headline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Creative Name"
          placeholder="Summer Banner"
          {...register(`creatives.${index}.name`)}
          error={creativeErrors?.name?.message}
        />
        <Input
          label="Headline (max 34 chars)"
          placeholder="Shop the Sale Now"
          maxLength={34}
          {...register(`creatives.${index}.headline`)}
          error={creativeErrors?.headline?.message}
        />
      </div>

      {/* Brand + CTA + Ad Set */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Brand Name (optional)"
          placeholder="Acme Corp"
          maxLength={25}
          {...register(`creatives.${index}.brandName`)}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Call to Action"
          options={CTA_OPTIONS}
          {...register(`creatives.${index}.callToAction`)}
        />
        <Select
          label="Ad Set"
          options={adSquadOptions}
          placeholder="Select ad set"
          {...register(`creatives.${index}.adSquadId`)}
          error={creativeErrors?.adSquadId?.message}
        />
      </div>

      {/* Ad Status */}
      <div className="w-40">
        <Select
          label="Ad Status"
          options={AD_STATUS_OPTIONS}
          {...register(`creatives.${index}.adStatus`)}
        />
      </div>

      <input type="hidden" {...register(`creatives.${index}.id`)} />
      <input type="hidden" {...register(`creatives.${index}.uploadStatus`)} />
    </div>
  );
}

function defaultCreative(adSquadId: string) {
  return {
    id: uuid(),
    adSquadId,
    name: "",
    headline: "",
    brandName: "Amphy",
    callToAction: "SHOP_NOW",
    mediaId: "",
    mediaFileName: "",
    uploadStatus: "idle" as const,
    interactionType: "WEB_VIEW" as const,
    webViewUrl: "https://blackbusinesswave.com/",
    adStatus: "PAUSED" as const,
  };
}

export function Step3Creatives() {
  const { adSquads, creatives, setCreatives, setStep } = useWizardStore();

  // Clear pending File references when the component unmounts (e.g. user navigates back
  // without submitting) to release ~30 MB video buffers from memory.
  useEffect(() => () => { pendingMediaFiles.clear(); }, []);

  const adSquadOptions = adSquads.map((sq, i) => ({
    value: sq.id,
    label: sq.name || `Ad Set #${i + 1}`,
  }));

  const { register, control, handleSubmit, getValues, setValue, formState: { errors } } = useForm<CreativesFormValues>({
    resolver: zodResolver(creativesFormSchema),
    defaultValues: {
      creatives: creatives.length > 0
        ? creatives
        : [defaultCreative(adSquads[0]?.id ?? "")],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "creatives" });

  const onNext = (data: CreativesFormValues) => {
    // Merge transcoded File objects (stored in pendingMediaFiles) into the creatives
    // before handing off to the store — they aren't form fields so react-hook-form
    // doesn't carry them, but the submission orchestrator needs them.
    const withFiles = (data.creatives as CreativeFormData[]).map((cr) => ({
      ...cr,
      mediaFile: pendingMediaFiles.get(cr.id),
    }));
    // Release all File references — store now owns them; old entries (stale UUIDs
    // from previous sessions or removed creatives) would otherwise leak memory.
    pendingMediaFiles.clear();
    setCreatives(withFiles);
    setStep(4);
  };

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      {fields.map((field, i) => (
        <CreativeCard
          key={field.id}
          index={i}
          creativeId={getValues(`creatives.${i}.id`) as string}
          adSquadOptions={adSquadOptions}
          control={control}
          register={register}
          errors={errors}
          setValue={setValue}
          canRemove={fields.length > 1}
          onRemove={() => remove(i)}
          onDuplicate={() => {
            const current = getValues(`creatives.${i}`);
            append({
              ...current,
              id: uuid(),
              // Reset media — each creative needs its own upload
              mediaId: "",
              mediaFileName: "",
              uploadStatus: "idle",
            });
          }}
        />
      ))}

      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          const lastAdSquadId = fields.length > 0
            ? getValues(`creatives.${fields.length - 1}.adSquadId`)
            : (adSquads[0]?.id ?? "");
          append(defaultCreative(lastAdSquadId));
        }}
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
