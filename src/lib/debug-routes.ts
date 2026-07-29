// Diagnostic endpoints (/api/debug/placement-probe, /api/meta/debug/test-launch)
// create real ad objects against live accounts. They are useful for live-evidence
// investigations — the placement probe is the basis of the snapchat-placement-debugger
// workflow — but they should not sit exposed in production between investigations.
//
// Default: OFF in production, ON everywhere else. Set ENABLE_DEBUG_ROUTES=1 in the
// Vercel project when you actually need to run a probe, then unset it afterwards.
export function debugRoutesEnabled(): boolean {
  if (process.env.ENABLE_DEBUG_ROUTES === "1") return true;
  return process.env.NODE_ENV !== "production";
}
