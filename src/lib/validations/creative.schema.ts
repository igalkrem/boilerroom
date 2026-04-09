import { z } from "zod";

export const creativeSchema = z.object({
  id: z.string(),
  adSquadId: z.string().min(1, "Select an ad set"),
  name: z.string().min(1, "Name is required").max(375),
  headline: z.string().min(1, "Headline is required").max(34, "Max 34 characters"),
  brandName: z.string().max(25).optional(),
  callToAction: z.string().optional(),
  mediaId: z.string().min(1, "Upload a media file"),
  mediaFileName: z.string().optional(),
  uploadStatus: z.enum(["idle", "uploading", "done", "error"]),
});

export type CreativeSchema = z.infer<typeof creativeSchema>;

export const creativesFormSchema = z.object({
  creatives: z.array(creativeSchema).min(1, "Add at least one creative"),
});
