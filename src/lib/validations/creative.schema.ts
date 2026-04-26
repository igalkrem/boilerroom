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
    mediaId: z.string(),
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
    // Ad settings
    adStatus: z.enum(["ACTIVE", "PAUSED"]),
    siloAssetId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // File must be selected and processed (mediaId is resolved at submission time)
    if (data.uploadStatus !== "done") {
      ctx.addIssue({
        code: "custom",
        path: ["mediaId"],
        message: "Upload a media file",
      });
    }

    if (data.interactionType === "WEB_VIEW") {
      if (!data.webViewUrl || data.webViewUrl.trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: ["webViewUrl"],
          message: "Web View URL is required",
        });
      } else {
        try {
          const parsed = new URL(data.webViewUrl);
          if (!/^https?:$/.test(parsed.protocol)) {
            ctx.addIssue({
              code: "custom",
              path: ["webViewUrl"],
              message: "URL must use http or https",
            });
          }
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
      } else if (/^(javascript|data):/i.test(data.deepLinkUrl.trim())) {
        ctx.addIssue({
          code: "custom",
          path: ["deepLinkUrl"],
          message: "Invalid URL scheme",
        });
      }
    }
  });

export type CreativeSchema = z.infer<typeof creativeSchema>;

export const creativesFormSchema = z.object({
  creatives: z.array(creativeSchema).min(1, "Add at least one creative"),
});
