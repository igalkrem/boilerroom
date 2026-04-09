import { z } from "zod";

export const campaignSchema = z.object({
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
  dailyBudgetUsd: z.number().min(1, "Budget must be at least $1"),
});

export type CampaignSchema = z.infer<typeof campaignSchema>;

export const campaignsFormSchema = z.object({
  campaigns: z.array(campaignSchema).min(1, "Add at least one campaign"),
});
