// Pure, dependency-free — no metaFetch/session import — so it can be used by
// both server routes and the client-side meta-submission-orchestrator.ts.
import type { MetaCreativeFeaturesSpec, MetaDegreesOfFreedomSpec } from "@/types/meta";

// "Format: Flexible" + "Advantage+ creative optimizations", confirmed live
// 2026-07-16 against a real reference ad — see MetaDegreesOfFreedomSpec.
export function buildAdvantagePlusCreativeFeatures(mediaType: "IMAGE" | "VIDEO"): MetaDegreesOfFreedomSpec {
  const creative_features_spec: MetaCreativeFeaturesSpec = {
    advantage_plus_creative: { enroll_status: "OPT_IN" },
    inline_comment: { enroll_status: "OPT_IN" },
    product_extensions: { enroll_status: "OPT_IN" },
    site_extensions: { enroll_status: "OPT_IN" },
    standard_enhancements: { enroll_status: "OPT_IN" },
    text_optimizations: { enroll_status: "OPT_IN" },
    ...(mediaType === "VIDEO" ? { video_auto_crop: { enroll_status: "OPT_IN" as const } } : {}),
  };
  return { creative_features_spec };
}
