"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { Input, Select, Button } from "@/components/ui";
import { upsertArticle } from "@/lib/articles";
import { loadFeedProviders } from "@/lib/feed-providers";
import type { Article } from "@/types/article";
import type { FeedProvider } from "@/types/feed-provider";

const LOCALES = [
  { value: "", label: "— Select language —" },
  { value: "de_DE", label: "German - Germany" },
  { value: "en_AU", label: "English - Australia" },
  { value: "en_CA", label: "English - Canada" },
  { value: "en_GB", label: "English - United Kingdom" },
  { value: "es_AR", label: "Spanish - Argentina" },
  { value: "es_ES", label: "Spanish - Spain" },
  { value: "pt_BR", label: "Portuguese - Brazil" },
  { value: "fr_FR", label: "French - France" },
  { value: "it_IT", label: "Italian - Italy" },
  { value: "en_US", label: "English - United States" },
];

const articleFormSchema = z.object({
  feedProviderId: z.string().min(1, "Feed provider is required"),
  slug: z.string().min(1, "Keyword is required").max(200),
  query: z.string().max(500),
  title: z.string().max(200),
  previewUrl: z.string().max(2000),
  domain: z.string().max(200),
  locale: z.string().max(10),
  allowedHeadlines: z.array(
    z.object({
      text: z.string().max(34, "Max 34 characters"),
      rac: z.string().max(100),
    })
  ),
});

type ArticleFormValues = z.infer<typeof articleFormSchema>;

interface ArticleFormProps {
  article?: Article;
}

export function ArticleForm({ article }: ArticleFormProps) {
  const router = useRouter();
  const [providers, setProviders] = useState<FeedProvider[]>([]);

  useEffect(() => {
    setProviders(loadFeedProviders());
  }, []);

  // Re-apply saved domain after providers load — HTML select can't select an option
  // that doesn't exist in the DOM at mount time (providers are empty on first render).
  useEffect(() => {
    if (providers.length > 0 && article?.domain) {
      setValue("domain", article.domain);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers.length]);

  const providerOptions = [
    { value: "", label: "Select feed provider" },
    ...providers.map((p) => ({ value: p.id, label: p.name })),
  ];

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ArticleFormValues>({
    resolver: zodResolver(articleFormSchema),
    defaultValues: article
      ? {
          feedProviderId: article.feedProviderId,
          slug: article.slug,
          query: article.query ?? "",
          title: article.title ?? "",
          previewUrl: article.previewUrl ?? "",
          domain: article.domain ?? "",
          locale: article.locale ?? "",
          allowedHeadlines: article.allowedHeadlines.map((h) => ({ text: h.text, rac: h.rac })),
        }
      : { feedProviderId: "", slug: "", query: "", title: "", previewUrl: "", domain: "", locale: "", allowedHeadlines: [] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "allowedHeadlines",
  });

  const watchedProviderId = watch("feedProviderId");
  const selectedProvider = providers.find((p) => p.id === watchedProviderId);
  const hasDomains = (selectedProvider?.domains ?? []).length > 0;
  const domainOptions = [
    { value: "", label: "— No domain —" },
    ...(selectedProvider?.domains ?? []).map((d) => ({ value: d.baseDomain, label: d.baseDomain })),
  ];

  const onSubmit = (data: ArticleFormValues) => {
    const saved: Article = {
      id: article?.id ?? uuid(),
      feedProviderId: data.feedProviderId,
      slug: data.slug,
      query: data.query.trim(),
      title: data.title.trim() || undefined,
      previewUrl: data.previewUrl.trim() || undefined,
      domain: data.domain || undefined,
      locale: data.locale || undefined,
      allowedHeadlines: data.allowedHeadlines
        .filter((h) => h.text.trim().length > 0)
        .map((h) => ({ text: h.text.trim(), rac: h.rac.trim() })),
      createdAt: article?.createdAt ?? new Date().toISOString(),
    };
    upsertArticle(saved);
    router.push("/dashboard/articles");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="space-y-4 max-w-md">
          {providers.length === 0 ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              No feed providers yet.{" "}
              <a href="/dashboard/feed-providers" className="underline font-medium">
                Create one first
              </a>
              .
            </div>
          ) : (
            <Select
              label="Feed Provider"
              options={providerOptions}
              {...register("feedProviderId")}
              error={errors.feedProviderId?.message}
            />
          )}

          {/* Domain picker — reactive to provider selection */}
          {watchedProviderId && (
            <div>
              <Select
                label="Domain"
                options={hasDomains ? domainOptions : [{ value: "", label: "No domains configured for this provider" }]}
                disabled={!hasDomains}
                {...register("domain")}
                error={errors.domain?.message}
              />
              {!hasDomains && (
                <p className="text-xs text-gray-400 mt-1">
                  Add domains in the Feed Provider settings to enable this picker.
                </p>
              )}
            </div>
          )}

          <div>
            <Input
              label="Keyword"
              placeholder="e.g. best-cars-2026"
              {...register("slug")}
              error={errors.slug?.message}
            />
            <p className="text-xs text-gray-500 mt-1">
              Used as the URL parameter value. Resolves{" "}
              <code className="font-mono bg-gray-100 px-1 rounded">{"{{article.name}}"}</code>.
            </p>
          </div>

          <Input
            label="Title"
            placeholder="e.g. Best Phone Packages for SMBs"
            {...register("title")}
            error={errors.title?.message}
          />

          <div>
            <Input
              label="Search Query"
              placeholder="e.g. best cars 2026"
              {...register("query")}
              error={errors.query?.message}
            />
            <p className="text-xs text-gray-500 mt-1">
              Keyword passed as the search= / q= parameter in the URL. Resolves{" "}
              <code className="font-mono bg-gray-100 px-1 rounded">{"{{article.query}}"}</code>.
            </p>
          </div>

          <Select
            label="Language"
            options={LOCALES}
            {...register("locale")}
            error={errors.locale?.message}
          />

          <Input
            label="Preview URL"
            placeholder="https://example.com/article"
            {...register("previewUrl")}
            error={errors.previewUrl?.message}
          />
        </div>
      </div>

      {/* Allowed Headlines */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Allowed Headlines</h2>
            <p className="text-xs text-gray-500 mt-0.5">Max 34 characters each (Snapchat limit).</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => append({ text: "", rac: "" })}
          >
            + Add Headline
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            No headlines added — the headline field in the wizard will accept any text.
          </p>
        ) : (
          <div className="space-y-3 max-w-md">
            {fields.map((field, i) => (
              <div key={field.id} className="space-y-1">
                {/* Headline text row with remove button */}
                <div className="flex items-center gap-2">
                  <input
                    placeholder="Enter headline (max 34 chars)"
                    maxLength={34}
                    {...register(`allowedHeadlines.${i}.text`)}
                    className={`flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                      errors.allowedHeadlines?.[i]?.text ? "border-red-400" : "border-gray-200"
                    }`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-600 shrink-0"
                    onClick={() => remove(i)}
                  >
                    ✕
                  </Button>
                </div>
                {errors.allowedHeadlines?.[i]?.text && (
                  <p className="text-xs text-red-500">{errors.allowedHeadlines[i]?.text?.message}</p>
                )}
                {/* RAC field — muted, clearly subordinate */}
                <input
                  placeholder="RAC"
                  maxLength={100}
                  {...register(`allowedHeadlines.${i}.rac`)}
                  className="w-full px-3 py-1.5 text-xs text-gray-400 placeholder-gray-300 border border-gray-100 bg-gray-50 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-300 focus:border-cyan-300"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/dashboard/articles")}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg">
          {article ? "Update Article" : "Save Article"}
        </Button>
      </div>
    </form>
  );
}
