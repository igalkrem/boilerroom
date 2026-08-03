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

// CR-8: the fallback warning fired once per URL, and callers like the catalogue delete
// path check up to 50 URLs per request — 50 identical lines per request buries the signal
// it exists to raise. Latch it so the condition is reported once per process instead.
let warnedMissingToken = false;

/**
 * True only for a URL whose host is a Vercel Blob host belonging to this project's
 * store. Never throws — a malformed URL is simply not ours.
 *
 * CR-8: this used to FAIL OPEN when the token was missing or unparseable, returning true
 * for any `*.blob.vercel-storage.com` host — i.e. any Vercel customer's public store, not
 * just ours. Callers then fetch that URL server-side and hand it to Snapchat/Meta as a
 * file_url, so failing open is an SSRF-shaped hole, not a convenience.
 *
 * The old justification was that failing closed "would break all uploads and transcoding".
 * That reasoning is inverted: writing to Blob REQUIRES this token, so if it is genuinely
 * absent in production, uploads are already broken and rejecting reads costs nothing.
 * Confirmed set for Production on Vercel. Development keeps the permissive fallback so a
 * local checkout without the token still works.
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
    if (!warnedMissingToken) {
      warnedMissingToken = true;
      console.error(
        "[blob-host] BLOB_READ_WRITE_TOKEN missing/unparseable — cannot identify this project's " +
          "blob store." +
          (process.env.NODE_ENV === "production"
            ? " REJECTING all blob URLs; uploads require this token anyway, so it must be set."
            : " Falling back to a suffix-only host check (development only).")
      );
    }
    return process.env.NODE_ENV !== "production";
  }
  return host.startsWith(`${store}.`);
}
