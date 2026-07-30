/**
 * Meta counterpart to src/lib/snapchat/errors.ts. metaFetch throws
 * `Meta API error ${status}: ${body}`, so callers that need to distinguish
 * "this entity is gone" from "Graph was unreachable" must match on that shape.
 * Conflating the two is how a transient 5xx ends up looking like a deleted ad set.
 */
export function isMetaEntityNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Meta API error 404\b/.test(msg)) return true;
  // Graph reports "does not exist" as a 400 with code 100 rather than a 404.
  return /does not exist|Unsupported get request/i.test(msg);
}
