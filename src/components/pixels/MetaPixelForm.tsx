"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { Input, Button } from "@/components/ui";
import { upsertMetaPixel } from "@/lib/meta-pixels";
import type { SavedMetaPixel } from "@/types/meta-pixel";

const metaPixelFormSchema = z.object({
  name: z.string().min(1, "Label is required").max(100),
  pixelId: z.string().min(1, "Pixel ID is required"),
});

type MetaPixelFormValues = z.infer<typeof metaPixelFormSchema>;

interface MetaPixelFormProps {
  pixel?: SavedMetaPixel;
}

export function MetaPixelForm({ pixel }: MetaPixelFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MetaPixelFormValues>({
    resolver: zodResolver(metaPixelFormSchema),
    defaultValues: pixel
      ? { name: pixel.name, pixelId: pixel.pixelId }
      : { name: "", pixelId: "" },
  });

  const onSubmit = (data: MetaPixelFormValues) => {
    const saved: SavedMetaPixel = {
      id: pixel?.id ?? uuid(),
      name: data.name,
      pixelId: data.pixelId,
      createdAt: pixel?.createdAt ?? new Date().toISOString(),
    };
    upsertMetaPixel(saved);
    router.push("/dashboard/traffic-sources");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
        <div className="space-y-4 max-w-md">
          <Input
            label="Pixel Label"
            placeholder="Main Website Pixel"
            {...register("name")}
            error={errors.name?.message}
          />
          <Input
            label="Meta Pixel ID"
            placeholder="e.g. 123456789012345"
            {...register("pixelId")}
            error={errors.pixelId?.message}
          />
          <p className="text-xs text-gray-500">
            Find your Pixel ID in Meta Events Manager under Data Sources.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/dashboard/traffic-sources")}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg">
          {pixel ? "Update Pixel" : "Save Pixel"}
        </Button>
      </div>
    </form>
  );
}
