import { z } from "zod";

export const campaignSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1, "Name is required").max(375),
    objective: z.enum([
      "AWARENESS_AND_ENGAGEMENT",
      "SALES",
      "TRAFFIC",
      "APP_PROMOTION",
      "LEADS",
    ]),
    status: z.enum(["ACTIVE", "PAUSED"]),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().optional(),
    spendCapType: z.enum(["DAILY_BUDGET", "NO_BUDGET"]),
    dailyBudgetUsd: z.number().optional(),
    lifetimeBudgetUsd: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.spendCapType === "DAILY_BUDGET") {
      if (!data.dailyBudgetUsd || data.dailyBudgetUsd < 20) {
        ctx.addIssue({
          code: "custom",
          path: ["dailyBudgetUsd"],
          message: "Daily budget must be at least $20",
        });
      }
    }
    // NO_BUDGET: no validation needed
  });

export type CampaignSchema = z.infer<typeof campaignSchema>;

export const campaignsFormSchema = z.object({
  campaigns: z.array(campaignSchema).min(1, "Add at least one campaign"),
});
