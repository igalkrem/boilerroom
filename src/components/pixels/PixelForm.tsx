"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { Input, Button } from "@/components/ui";
import { upsertPixel } from "@/lib/pixels";
import type { SavedPixel } from "@/types/pixel";

const pixelFormSchema = z.object({
  name: z.string().min(1, "Label is required").max(100),
  pixelId: z.string().min(1, "Pixel ID is required"),
});

type PixelFormValues = z.infer<typeof pixelFormSchema>;

interface PixelFormProps {
  pixel?: SavedPixel;
}

export function PixelForm({ pixel }: PixelFormProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PixelFormValues>({
    resolver: zodResolver(pixelFormSchema),
    defaultValues: pixel
      ? { name: pixel.name, pixelId: pixel.pixelId }
      : { name: "", pixelId: "" },
  });

  const onSubmit = (data: PixelFormValues) => {
    const saved: SavedPixel = {
      id: pixel?.id ?? uuid(),
      name: data.name,
      pixelId: data.pixelId,
      createdAt: pixel?.createdAt ?? new Date().toISOString(),
    };
    upsertPixel(saved);
    router.push("/dashboard/pixels");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="space-y-4 max-w-md">
          <Input
            label="Pixel Label"
            placeholder="Main Website Pixel"
            {...register("name")}
            error={errors.name?.message}
          />
          <Input
            label="Snap Pixel ID"
            placeholder="e.g. a1b2c3d4-e5f6-..."
            {...register("pixelId")}
            error={errors.pixelId?.message}
          />
          <p className="text-xs text-gray-500">
            Find your Pixel ID in Snapchat Ads Manager under Events Manager.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/dashboard/pixels")}
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
