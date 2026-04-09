import { z } from "zod";

export const adSquadSchema = z.object({
  id: z.string(),
  campaignId: z.string().min(1, "Select a campaign"),
  name: z.string().min(1, "Name is required").max(375),
  type: z.literal("SNAP_ADS"),
  geoCountryCode: z.string().min(2, "Select a country"),
  optimizationGoal: z.enum([
    "IMPRESSIONS",
    "SWIPES",
    "APP_INSTALLS",
    "LEAD_GENERATION",
    "PIXEL_PAGE_VIEW",
    "PIXEL_PURCHASE",
  ]),
  bidStrategy: z.enum([
    "AUTO_BID",
    "LOWEST_COST_WITH_MAX_BID",
    "TARGET_COST",
  ]),
  bidAmountUsd: z.number().optional(),
  dailyBudgetUsd: z.number().min(5, "Minimum budget is $5"),
  status: z.enum(["ACTIVE", "PAUSED"]),
});

export type AdSquadSchema = z.infer<typeof adSquadSchema>;

export const adSquadsFormSchema = z.object({
  adSquads: z.array(adSquadSchema).min(1, "Add at least one ad set"),
});
