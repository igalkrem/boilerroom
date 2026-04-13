import { z } from "zod";

export const adSquadSchema = z
  .object({
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
    spendCapType: z.enum(["DAILY_BUDGET", "LIFETIME_BUDGET"]),
    dailyBudgetUsd: z.number().optional(),
    lifetimeBudgetUsd: z.number().optional(),
    status: z.enum(["ACTIVE", "PAUSED"]),
    // Ad-set-level scheduling
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    // Delivery
    pacingType: z.enum(["STANDARD", "ACCELERATED"]),
    placementConfig: z.enum(["AUTOMATIC", "CONTENT"]),
    // Frequency cap
    frequencyCapMaxImpressions: z.number().int().positive().optional(),
    frequencyCapTimePeriod: z
      .enum(["HOURS_1", "HOURS_6", "HOURS_12", "DAY_1", "DAY_7", "MONTH_1"])
      .optional(),
    // Targeting
    targetingAgeMin: z.number().int().min(13).max(50).optional(),
    targetingAgeMax: z.number().int().min(13).max(50).optional(),
    targetingGender: z.enum(["ALL", "MALE", "FEMALE"]).optional(),
    targetingDeviceType: z.enum(["WEB", "MOBILE", "ALL"]).optional(),
    // Tracking
    pixelId: z.string().min(1, "Select a pixel"),
  })
  .superRefine((data, ctx) => {
    // Budget
    if (data.spendCapType === "DAILY_BUDGET") {
      if (!data.dailyBudgetUsd || data.dailyBudgetUsd < 5) {
        ctx.addIssue({
          code: "custom",
          path: ["dailyBudgetUsd"],
          message: "Daily budget must be at least $5",
        });
      }
    } else {
      if (!data.lifetimeBudgetUsd || data.lifetimeBudgetUsd < 5) {
        ctx.addIssue({
          code: "custom",
          path: ["lifetimeBudgetUsd"],
          message: "Lifetime budget must be at least $5",
        });
      }
    }

    // Bid amount required for non-AUTO strategies
    if (
      data.bidStrategy !== "AUTO_BID" &&
      (!data.bidAmountUsd || data.bidAmountUsd <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["bidAmountUsd"],
        message: "Bid amount is required for this strategy",
      });
    }

    // Frequency cap co-dependency
    const hasMaxImpressions = !!data.frequencyCapMaxImpressions;
    const hasTimePeriod = !!data.frequencyCapTimePeriod;
    if (hasMaxImpressions && !hasTimePeriod) {
      ctx.addIssue({
        code: "custom",
        path: ["frequencyCapTimePeriod"],
        message: "Select a time period for the frequency cap",
      });
    }
    if (hasTimePeriod && !hasMaxImpressions) {
      ctx.addIssue({
        code: "custom",
        path: ["frequencyCapMaxImpressions"],
        message: "Enter max impressions for the frequency cap",
      });
    }

    // Age range
    if (
      data.targetingAgeMin !== undefined &&
      data.targetingAgeMax !== undefined &&
      data.targetingAgeMin > data.targetingAgeMax
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["targetingAgeMax"],
        message: "Max age must be greater than or equal to min age",
      });
    }
  });

export type AdSquadSchema = z.infer<typeof adSquadSchema>;

export const adSquadsFormSchema = z.object({
  adSquads: z.array(adSquadSchema).min(1, "Add at least one ad set"),
});
