// Pure, dependency-free — no metaFetch/session import — so it can be used by
// both server routes and the client-side meta-submission-orchestrator.ts.
import type { MetaCreativeFeaturesSpec, MetaDegreesOfFreedomSpec } from "@/types/meta";

// "Format: Flexible" + "Advantage+ creative optimizations", confirmed live
// 2026-07-16 against a real reference ad — see MetaDegreesOfFreedomSpec.
//
// standard_enhancements is deliberately OMITTED: sending it on creative
// creation fails live with error_subcode 3858504, error_user_title "Creative
// should not include standard enhancements" / error_user_msg "Including
// standard enhancements field in creative has been deprecated. Please choose
// to set individual features instead." (confirmed 2026-07-16 via the
// meta-debug test-launch tool) — even though GET on an existing creative
// still reads it back as an aggregate. The other flags below already ARE
// those "individual features" Meta wants.
export function buildAdvantagePlusCreativeFeatures(mediaType: "IMAGE" | "VIDEO"): MetaDegreesOfFreedomSpec {
  const creative_features_spec: MetaCreativeFeaturesSpec = {
    advantage_plus_creative: { enroll_status: "OPT_IN" },
    inline_comment: { enroll_status: "OPT_IN" },
    product_extensions: { enroll_status: "OPT_IN" },
    site_extensions: { enroll_status: "OPT_IN" },
    text_optimizations: { enroll_status: "OPT_IN" },
    ...(mediaType === "VIDEO" ? { video_auto_crop: { enroll_status: "OPT_IN" as const } } : {}),
  };
  return { creative_features_spec };
}
