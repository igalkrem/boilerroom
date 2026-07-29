// Single source of truth for "is this URL one of OUR Vercel Blob objects?"
//
// Two bugs this replaces:
//  1. `/api/meta/media` tested `url.includes(".vercel-storage.com")` — a substring
//     test against the WHOLE url, so `https://evil.tld/?x=.vercel-storage.com`
//     passed and was then fetched server-side and handed to Meta as a file_url.
//  2. Every other site used `new URL(u).hostname.endsWith(".vercel-storage.com")`,
//     which correctly parses the host but matches ANY Vercel customer's public
//     store, not just ours.
//
// Public Blob URLs look like `https://<storeId>.public.blob.vercel-storage.com/<path>`,
// and BLOB_READ_WRITE_TOKEN is `vercel_blob_rw_<storeId>_<secret>` — so the store id
// is derivable at runtime with no new env var.

const BLOB_SUFFIX = ".blob.vercel-storage.com";

function ownStoreId(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const parts = token.split("_");
  if (parts.length < 5 || parts[0] !== "vercel" || parts[1] !== "blob") return null;
  return parts[3]?.toLowerCase() || null;
}

/**
 * True only for a URL whose host is a Vercel Blob host belonging to this project's
 * store. Never throws — a malformed URL is simply not ours.
 *
 * If the token can't be parsed we fall back to the suffix-only check rather than
 * rejecting every blob URL, since a hard failure here would break all uploads and
 * transcoding. The warning makes that state observable instead of silent.
 */
export function isOwnBlobUrl(raw: string): boolean {
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host.endsWith(BLOB_SUFFIX)) return false;

  const store = ownStoreId();
  if (!store) {
    console.warn("[blob-host] BLOB_READ_WRITE_TOKEN missing/unparseable — falling back to suffix-only host check");
    return true;
  }
  return host.startsWith(`${store}.`);
}
