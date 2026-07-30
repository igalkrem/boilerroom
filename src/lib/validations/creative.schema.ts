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
    mediaId: z.string().optional(),
    mediaFileName: z.string().optional(),
    uploadStatus: z.enum(["idle", "uploading", "done", "error"]),
    isCatalogue: z.boolean().optional(),
    // Interaction
    interactionType: z.enum([
      "SWIPE_TO_OPEN",
      "WEB_VIEW",
    ]),
    webViewUrl: z.string().optional(),
    // Ad settings
    adStatus: z.enum(["ACTIVE", "PAUSED"]),
    siloAssetId: z.string().optional(),
    articleId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Catalogue creatives (DPA) have no media — skip media validation
    if (data.isCatalogue) return;

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
          // Snapchat requires an SSL-enabled web view URL and caps it at 2048 chars.
          // The cap is the live risk: buildUrlTemplate() appends an unbounded
          // macro-expanded query string, so a long provider URL can overrun it.
          if (parsed.protocol !== "https:") {
            ctx.addIssue({
              code: "custom",
              path: ["webViewUrl"],
              message: "URL must use https — Snapchat requires an SSL-enabled web view URL",
            });
          }
          if (data.webViewUrl.length > 2048) {
            ctx.addIssue({
              code: "custom",
              path: ["webViewUrl"],
              message: `URL is ${data.webViewUrl.length} characters — Snapchat's limit is 2048`,
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
  });

export type CreativeSchema = z.infer<typeof creativeSchema>;

export const creativesFormSchema = z.object({
  creatives: z.array(creativeSchema).min(1, "Add at least one creative"),
});
