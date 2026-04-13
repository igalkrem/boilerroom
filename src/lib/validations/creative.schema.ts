import { z } from "zod";

export const creativeSchema = z
  .object({
    id: z.string(),
    adSquadId: z.string().min(1, "Select an ad set"),
    name: z.string().min(1, "Name is required").max(375),
    headline: z
      .string()
      .min(1, "Headline is required")
      .max(34, "Max 34 characters"),
    brandName: z.string().max(25).optional(),
    callToAction: z.string().optional(),
    mediaId: z.string().min(1, "Upload a media file"),
    mediaFileName: z.string().optional(),
    uploadStatus: z.enum(["idle", "uploading", "done", "error"]),
    // Interaction
    interactionType: z.enum([
      "SWIPE_TO_OPEN",
      "WEB_VIEW",
      "DEEP_LINK",
      "APP_INSTALL",
    ]),
    webViewUrl: z.string().optional(),
    deepLinkUrl: z.string().optional(),
    shareable: z.boolean().optional(),
    // Ad settings
    adStatus: z.enum(["ACTIVE", "PAUSED"]),
  })
  .superRefine((data, ctx) => {
    if (data.interactionType === "WEB_VIEW") {
      if (!data.webViewUrl || data.webViewUrl.trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: ["webViewUrl"],
          message: "Web View URL is required",
        });
      } else {
        try {
          new URL(data.webViewUrl);
        } catch {
          ctx.addIssue({
            code: "custom",
            path: ["webViewUrl"],
            message: "Must be a valid URL",
          });
        }
      }
    }
    if (
      data.interactionType === "DEEP_LINK" ||
      data.interactionType === "APP_INSTALL"
    ) {
      if (!data.deepLinkUrl || data.deepLinkUrl.trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: ["deepLinkUrl"],
          message: "Deep link URL is required",
        });
      }
    }
  });

export type CreativeSchema = z.infer<typeof creativeSchema>;

export const creativesFormSchema = z.object({
  creatives: z.array(creativeSchema).min(1, "Add at least one creative"),
});
