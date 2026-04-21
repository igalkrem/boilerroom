import { z } from "zod";

export const adSquadSchema = z
  .object({
    id: z.string(),
    campaignId: z.string().min(1, "Select a campaign"),
    name: z.string().min(1, "Name is required").max(375),
    type: z.literal("SNAP_ADS"),
    geoCountryCode: z.string().min(2, "Select a country"),
    optimizationGoal: z.enum([
      "PIXEL_PURCHASE",
      "PIXEL_SIGNUP",
      "PIXEL_ADD_TO_CART",
      "PIXEL_PAGE_VIEW",
      "LANDING_PAGE_VIEW",
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
    placementConfig: z.enum(["AUTOMATIC", "CONTENT"]),
    // Targeting
    targetingGender: z.enum(["ALL", "MALE", "FEMALE"]).optional(),
    targetingDeviceType: z.enum(["WEB", "MOBILE", "ALL"]).optional(),
    targetingOsType: z.enum(["iOS", "ANDROID"]).optional(),
    // Tracking
    pixelId: z.string().optional(),
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

    // pixel_id is optional — sent when provided, not required for any current optimization goal
  });

export type AdSquadSchema = z.infer<typeof adSquadSchema>;

export const adSquadsFormSchema = z.object({
  adSquads: z.array(adSquadSchema).min(1, "Add at least one ad set"),
});
