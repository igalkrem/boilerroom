"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { Input, Button } from "@/components/ui";
import { upsertFeedProvider } from "@/lib/feed-providers";
import type { FeedProvider } from "@/types/article";

const feedProviderFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  parameterName: z
    .string()
    .min(1, "Parameter name is required")
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, hyphens, and underscores"),
  baseUrl: z
    .string()
    .min(1, "Base URL is required")
    .url("Must be a valid URL"),
});

type FeedProviderFormValues = z.infer<typeof feedProviderFormSchema>;

interface FeedProviderFormProps {
  provider?: FeedProvider;
}

export function FeedProviderForm({ provider }: FeedProviderFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FeedProviderFormValues>({
    resolver: zodResolver(feedProviderFormSchema),
    defaultValues: provider
      ? { name: provider.name, parameterName: provider.parameterName, baseUrl: provider.baseUrl }
      : { name: "", parameterName: "", baseUrl: "" },
  });

  const onSubmit = (data: FeedProviderFormValues) => {
    const saved: FeedProvider = {
      id: provider?.id ?? uuid(),
      name: data.name,
      parameterName: data.parameterName,
      baseUrl: data.baseUrl.replace(/\/$/, ""),
      createdAt: provider?.createdAt ?? new Date().toISOString(),
    };
    upsertFeedProvider(saved);
    router.push("/dashboard/articles/feed-providers");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="space-y-4 max-w-md">
          <Input
            label="Provider Name"
            placeholder="e.g. Main Feed"
            {...register("name")}
            error={errors.name?.message}
          />
          <Input
            label="URL Parameter Name"
            placeholder="e.g. article"
            {...register("parameterName")}
            error={errors.parameterName?.message}
          />
          <Input
            label="Base URL"
            placeholder="https://example.com/lp"
            type="url"
            {...register("baseUrl")}
            error={errors.baseUrl?.message}
          />
          <p className="text-xs text-gray-500">
            The final landing page URL will be: <span className="font-mono">baseUrl?parameterName=slug</span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/dashboard/articles/feed-providers")}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg">
          {provider ? "Update Feed Provider" : "Save Feed Provider"}
        </Button>
      </div>
    </form>
  );
}
