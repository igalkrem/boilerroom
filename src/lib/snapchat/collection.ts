import { snapFetch } from "./client";
import type {
  SnapCreativeElementPayload,
  SnapCreativeElement,
  SnapInteractionZonePayload,
  SnapInteractionZone,
  SnapBatchResponse,
} from "@/types/snapchat";

// Collection Ads (Dynamic Product Ads) require, in order:
//   1. N creative elements (BUTTON placeholders for the product tiles)
//   2. one interaction zone grouping those elements
//   3. a COLLECTION creative referencing the interaction zone
// These two helpers create steps 1 and 2.

export async function createCreativeElements(
  adAccountId: string,
  elements: SnapCreativeElementPayload[]
): Promise<Array<SnapCreativeElement & { error?: string }>> {
  const data = await snapFetch<SnapBatchResponse<SnapCreativeElement>>(
    `/adaccounts/${adAccountId}/creative_elements`,
    {
      method: "POST",
      body: JSON.stringify({ creative_elements: elements }),
    }
  );

  return (data.creative_elements ?? []).map((item) => {
    if (item.sub_request_status !== "SUCCESS") {
      console.error("Creative element create failed:", JSON.stringify(item));
    }
    return {
      ...(item.creative_element ?? ({} as SnapCreativeElement)),
      error:
        item.sub_request_status !== "SUCCESS"
          ? item.sub_request_error_reason ||
            [item.error_type ?? item.error?.error_type, item.message ?? item.error?.message].filter(Boolean).join(": ") ||
            "Unknown error"
          : undefined,
    };
  });
}

export async function createInteractionZones(
  adAccountId: string,
  zones: SnapInteractionZonePayload[]
): Promise<Array<SnapInteractionZone & { error?: string }>> {
  const data = await snapFetch<SnapBatchResponse<SnapInteractionZone>>(
    `/adaccounts/${adAccountId}/interaction_zones`,
    {
      method: "POST",
      body: JSON.stringify({ interaction_zones: zones }),
    }
  );

  return (data.interaction_zones ?? []).map((item) => {
    if (item.sub_request_status !== "SUCCESS") {
      console.error("Interaction zone create failed:", JSON.stringify(item));
    }
    return {
      ...(item.interaction_zone ?? ({} as SnapInteractionZone)),
      error:
        item.sub_request_status !== "SUCCESS"
          ? item.sub_request_error_reason ||
            [item.error_type ?? item.error?.error_type, item.message ?? item.error?.message].filter(Boolean).join(": ") ||
            "Unknown error"
          : undefined,
    };
  });
}
