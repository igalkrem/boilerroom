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
import { SiloBrowser } from "@/components/silo/SiloBrowser";
import { getSnapMediaId, getAssetById } from "@/lib/silo";
import type { SiloAsset } from "@/types/silo";
import { loadArticles } from "@/lib/articles";
import { loadFeedProviders } from "@/lib/feed-providers";
import { buildArticleUrl } from "@/types/article";
import type { Article, FeedProvider } from "@/types/article";

type CreativesFormValues = z.infer<typeof creativesFormSchema>;

const CTA_OPTIONS = [
  { value: "", label: "None" },
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

// Silo assets that have no cached Snapchat mediaId for the current ad account.
// Instead of downloading to the browser, we store the blob URL here and let the
// orchestrator call uploadBlobToSnapchat (server-side, no size limit) at submit time.
const pendingSiloBlobUploads = new Map<string, {
  blobUrl: string;
  mediaType: "VIDEO" | "IMAGE";
  originalFileName: string;
}>();


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
      if (!file.type.startsWith("video/")) {
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
            <p className="text-xs text-gray-400 mt-1">PNG/JPG (auto-resized to 1080×1920) · MP4/MOV · uploaded on submit</p>
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
  siloAsset,
  onOpenSilo,
  onClearSilo,
  siloLoading,
  articles,
  feedProviders,
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
  siloAsset?: SiloAsset;
  onOpenSilo: () => void;
  onClearSilo: () => void;
  siloLoading: boolean;
  articles: Article[];
  feedProviders: FeedProvider[];
}) {
  const interactionType = useWatch({ control, name: `creatives.${index}.interactionType` });
  const watchedArticleId = useWatch({ control, name: `creatives.${index}.articleId` });
  const creativeErrors = errors.creatives?.[index];

  const selectedArticle = articles.find((a) => a.id === watchedArticleId) ?? null;
  const hasConstrainedHeadlines =
    selectedArticle !== null && selectedArticle.allowedHeadlines.length > 0;

  const headlineOptions =
    selectedArticle?.allowedHeadlines.map((h) => ({ value: h, label: h })) ?? [];

  const articleOptions = [
    { value: "", label: "None (manual URL)" },
    ...articles.map((a) => {
      const providerName =
        feedProviders.find((p) => p.id === a.feedProviderId)?.name ?? "Unknown";
      return { value: a.id, label: `${providerName}: ${a.slug}` };
    }),
  ];

  function handleArticleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const articleId = e.target.value;
    setValue(`creatives.${index}.articleId`, articleId);
    if (articleId) {
      const article = articles.find((a) => a.id === articleId);
      const provider = article
        ? feedProviders.find((p) => p.id === article.feedProviderId)
        : undefined;
      if (article && provider) {
        setValue(`creatives.${index}.webViewUrl`, buildArticleUrl(provider, article));
      }
    }
  }

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
        {siloAsset ? (
          <div className="border-2 border-cyan-200 bg-cyan-50 rounded-xl p-4 flex items-center gap-3">
            {siloAsset.thumbnailUrl && (
              <img src={siloAsset.thumbnailUrl} alt={siloAsset.name} className="w-12 h-20 object-cover rounded-lg shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-cyan-900 truncate">{siloAsset.name}</p>
              <p className="text-xs text-cyan-700">{siloAsset.mediaType} · from Silo</p>
              {siloAsset.mediaType === "VIDEO" && siloAsset.durationSeconds != null && (
                <p className="text-xs text-cyan-600">{Math.round(siloAsset.durationSeconds)}s</p>
              )}
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={onClearSilo} className="shrink-0">
              ✕ Change
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <MediaDropzone
              onFileReady={(file, fileName) => {
                pendingMediaFiles.set(creativeId, file);
                setValue(`creatives.${index}.mediaFileName`, fileName);
                setValue(`creatives.${index}.uploadStatus`, "done");
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onOpenSilo}
              disabled={siloLoading}
              className="w-full"
            >
              {siloLoading ? "Loading…" : "📚 Select from Silo"}
            </Button>
          </div>
        )}
        {creativeErrors?.mediaId && (
          <p className="text-xs text-red-600 mt-1">
            {creativeErrors.mediaId.message}
          </p>
        )}
      </div>

      {/* Article picker (WEB_VIEW only) */}
      {interactionType === "WEB_VIEW" && articles.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Article <span className="text-gray-400 font-normal">(optional — auto-fills URL &amp; headlines)</span>
          </label>
          <select
            value={watchedArticleId ?? ""}
            onChange={handleArticleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {articleOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input type="hidden" {...register(`creatives.${index}.articleId`)} />
        </div>
      )}
      {interactionType === "WEB_VIEW" && articles.length === 0 && (
        <input type="hidden" {...register(`creatives.${index}.articleId`)} />
      )}

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
      {(interactionType === "DEEP_LINK" || interactionType === "APP_INSTALL") && (
        <input type="hidden" {...register(`creatives.${index}.articleId`)} />
      )}

      {/* Name + Headline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Creative Name"
          placeholder="Summer Banner"
          {...register(`creatives.${index}.name`)}
          error={creativeErrors?.name?.message}
        />
        {hasConstrainedHeadlines ? (
          <Select
            label="Headline"
            options={headlineOptions}
            {...register(`creatives.${index}.headline`)}
            error={creativeErrors?.headline?.message}
          />
        ) : (
          <Input
            label="Headline (max 34 chars)"
            placeholder="Shop the Sale Now"
            maxLength={34}
            {...register(`creatives.${index}.headline`)}
            error={creativeErrors?.headline?.message}
          />
        )}
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
      <input type="hidden" {...register(`creatives.${index}.siloAssetId`)} />
      {interactionType === "SWIPE_TO_OPEN" && (
        <input type="hidden" {...register(`creatives.${index}.articleId`)} />
      )}
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
  const { adSquads, creatives, setCreatives, setStep, adAccountId } = useWizardStore();
  const [siloOpenForCreativeId, setSiloOpenForCreativeId] = useState<string | null>(null);
  const [siloLoadingForCreativeId, setSiloLoadingForCreativeId] = useState<string | null>(null);
  // Map of creativeId → selected SiloAsset (for display only; actual file/mediaId set via setValue)
  const [siloSelections, setSiloSelections] = useState<Map<string, SiloAsset>>(new Map());
  const [articles, setArticles] = useState<Article[]>([]);
  const [feedProviders, setFeedProviders] = useState<FeedProvider[]>([]);

  // Clear pending references when the component unmounts (e.g. user navigates back
  // without submitting) to release memory.
  useEffect(() => () => { pendingMediaFiles.clear(); pendingSiloBlobUploads.clear(); }, []);

  useEffect(() => {
    setArticles(loadArticles());
    setFeedProviders(loadFeedProviders());
  }, []);

  // Restore siloSelections visual state when user navigates Back from Step 4 and returns here.
  useEffect(() => {
    const restoredSelections = new Map<string, SiloAsset>();
    for (const cr of creatives) {
      if (cr.siloAssetId) {
        const asset = getAssetById(cr.siloAssetId);
        if (asset) restoredSelections.set(cr.id, asset);
      }
    }
    if (restoredSelections.size > 0) setSiloSelections(restoredSelections);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleSiloSelect(asset: SiloAsset) {
    const creativeId = siloOpenForCreativeId;
    if (!creativeId) return;
    setSiloOpenForCreativeId(null);

    // Find actual index by iterating fields
    let creativeIndex = -1;
    for (let i = 0; i < fields.length; i++) {
      if (getValues(`creatives.${i}.id`) === creativeId) { creativeIndex = i; break; }
    }
    if (creativeIndex === -1) return;

    setSiloLoadingForCreativeId(creativeId);
    const cachedMediaId = getSnapMediaId(asset, adAccountId);

    if (cachedMediaId) {
      // Reuse cached Snapchat mediaId — no upload needed at submission
      setValue(`creatives.${creativeIndex}.mediaId`, cachedMediaId);
      setValue(`creatives.${creativeIndex}.mediaFileName`, asset.name);
      setValue(`creatives.${creativeIndex}.uploadStatus`, "done");
      setValue(`creatives.${creativeIndex}.siloAssetId`, asset.id);
      pendingMediaFiles.delete(creativeId);
    } else {
      // No cached mediaId — queue a server-side upload via blob URL at submission time.
      // We never download the file to the browser; the orchestrator calls
      // uploadBlobToSnapchat which fetches server-to-server (no size limit, no chunking).
      pendingSiloBlobUploads.set(creativeId, {
        blobUrl: asset.optimizedUrl ?? asset.originalUrl,
        mediaType: asset.mediaType,
        originalFileName: asset.originalFileName,
      });
      setValue(`creatives.${creativeIndex}.mediaId`, "");
      setValue(`creatives.${creativeIndex}.mediaFileName`, asset.name);
      setValue(`creatives.${creativeIndex}.uploadStatus`, "done");
      setValue(`creatives.${creativeIndex}.siloAssetId`, asset.id);
    }

    setSiloSelections((prev) => new Map(prev).set(creativeId, asset));
    setSiloLoadingForCreativeId(null);
  }

  function handleClearSilo(creativeId: string, creativeIndex: number) {
    setSiloSelections((prev) => { const m = new Map(prev); m.delete(creativeId); return m; });
    pendingMediaFiles.delete(creativeId);
    setValue(`creatives.${creativeIndex}.mediaId`, "");
    setValue(`creatives.${creativeIndex}.mediaFileName`, "");
    setValue(`creatives.${creativeIndex}.uploadStatus`, "idle");
    setValue(`creatives.${creativeIndex}.siloAssetId`, "");
  }

  const onNext = (data: CreativesFormValues) => {
    const withFiles = (data.creatives as CreativeFormData[]).map((cr) => {
      const existingCreative = creatives.find(c => c.id === cr.id);
      // If mediaId is set (cached Snapchat ID), clear file/blob fields — no upload needed.
      // Otherwise fall back to pendingMediaFiles or the Zustand store (preserves across Back nav).
      if (cr.mediaId) {
        return { ...cr, mediaFile: undefined, siloAssetBlobUrl: undefined, siloAssetMediaType: undefined, siloAssetOriginalFileName: undefined };
      }
      const mediaFile = pendingMediaFiles.get(cr.id) ?? existingCreative?.mediaFile;
      const blobUpload = pendingSiloBlobUploads.get(cr.id);
      const siloAssetBlobUrl = blobUpload?.blobUrl ?? existingCreative?.siloAssetBlobUrl;
      const siloAssetMediaType = blobUpload?.mediaType ?? existingCreative?.siloAssetMediaType;
      const siloAssetOriginalFileName = blobUpload?.originalFileName ?? existingCreative?.siloAssetOriginalFileName;
      return { ...cr, mediaFile, siloAssetBlobUrl, siloAssetMediaType, siloAssetOriginalFileName };
    });
    pendingMediaFiles.clear();
    pendingSiloBlobUploads.clear();
    setCreatives(withFiles);
    setStep(4);
  };

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-6">
      {fields.map((field, i) => {
        const creativeId = getValues(`creatives.${i}.id`) as string;
        return (
          <CreativeCard
            key={field.id}
            index={i}
            creativeId={creativeId}
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
                siloAssetId: "",
              });
            }}
            siloAsset={siloSelections.get(creativeId)}
            onOpenSilo={() => setSiloOpenForCreativeId(creativeId)}
            onClearSilo={() => handleClearSilo(creativeId, i)}
            siloLoading={siloLoadingForCreativeId === creativeId}
            articles={articles}
            feedProviders={feedProviders}
          />
        );
      })}

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

      <SiloBrowser
        isOpen={siloOpenForCreativeId !== null}
        onClose={() => setSiloOpenForCreativeId(null)}
        onSelect={handleSiloSelect}
        adAccountId={adAccountId}
      />
    </form>
  );
}
