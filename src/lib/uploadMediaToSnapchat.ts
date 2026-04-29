/**
 * Client-side media upload pipeline.
 * Accepts an already-transcoded/resized File and uploads it to Snapchat
 * via our Next.js API routes. Called from the submission orchestrator's
 * "uploadMedia" stage so that all creatives upload in parallel.
 *
 * For video > 4 MB: chunked multipart-upload-v2 (parallel 4 MB chunks) then poll until READY.
 * For video ≤ 4 MB or image: single POST to /api/snapchat/media/upload — media is immediately READY, no polling.
 */

// Thrown when Snapchat hasn't finished processing within the poll window.
// The upload itself succeeded — caller should store mediaId and let the user check later.
export class PollTimeoutError extends Error {
  constructor(public readonly mediaId: string) {
    super(`Snapchat is still processing the video. Check back in a moment.`);
    this.name = "PollTimeoutError";
  }
}

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB per chunk — stays under Vercel's 4.5 MB function payload limit
// Simple upload sends the whole file in one request; Vercel limit is 4.5 MB.
// With ~100 KB of FormData overhead, safe upper bound is ~4.4 MB.
const SIMPLE_UPLOAD_MAX = 4.4 * 1024 * 1024;

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }
}

async function uploadChunked(
  file: File,
  mediaId: string,
  safeName: string,
  adAccountId: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  const numChunks = Math.ceil(file.size / CHUNK_SIZE);

  onProgress?.("Initializing upload...");
  const initRes = await fetch("/api/snapchat/media/upload-init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adAccountId,
      mediaId,
      fileName: safeName,
      fileSize: file.size,
      numberOfParts: numChunks,
    }),
  });
  const initData = await safeJson(initRes);
  if (initData.error) throw new Error(initData.error);
  const { upload_id, add_path, finalize_path } = initData;
  if (!upload_id) throw new Error("upload-init response missing upload_id");

  // Upload chunks in batches of 2 — keeps concurrent Snapchat requests low enough
  // to avoid 429s. Each chunk goes through its own Vercel function instance,
  // so the process-local rate limiter doesn't prevent cross-instance bursts.
  const CONCURRENCY = 2;
  onProgress?.(`Uploading ${numChunks} chunk${numChunks > 1 ? "s" : ""}...`);

  async function uploadChunk(i: number): Promise<void> {
    const start = i * CHUNK_SIZE;
    const chunk = file.slice(start, start + CHUNK_SIZE);
    const form = new FormData();
    form.append("chunk", new File([chunk], safeName));
    form.append("partNumber", String(i + 1));
    form.append("uploadId", upload_id);
    form.append("addPath", add_path);
    form.append("adAccountId", adAccountId);
    const res = await fetch("/api/snapchat/media/upload-chunk", {
      method: "POST",
      body: form,
    });
    const data = await safeJson(res);
    if (data.error) throw new Error(`Chunk ${i + 1}: ${data.error}`);
  }

  for (let i = 0; i < numChunks; i += CONCURRENCY) {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, numChunks - i) }, (_, j) =>
        uploadChunk(i + j)
      )
    );
  }

  onProgress?.("Finalizing upload...");
  const finalRes = await fetch("/api/snapchat/media/upload-finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adAccountId, uploadId: upload_id, finalizePath: finalize_path }),
  });
  const finalData = await safeJson(finalRes);
  if (finalData.error) throw new Error(finalData.error);
}

// Uploads a Silo asset to Snapchat by having the server fetch it from Vercel Blob
// and post it directly to Snapchat's simple upload endpoint.
// Snapchat marks the media READY immediately — no polling needed, any file size.
export async function uploadBlobToSnapchat(
  blobUrl: string,
  fileName: string,
  adAccountId: string,
  mediaType: "VIDEO" | "IMAGE",
  onProgress?: (msg: string) => void
): Promise<string> {
  const safeName = fileName
    .replace(/[^a-zA-Z0-9._\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 100) || "media";

  onProgress?.("Creating media entity...");
  const entityRes = await fetch("/api/snapchat/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adAccountId, name: safeName, type: mediaType }),
  });
  const entityData = await safeJson(entityRes);
  if (entityData.error) throw new Error(entityData.error);
  const { mediaId } = entityData as { mediaId: string };

  onProgress?.(mediaType === "VIDEO" ? "Uploading video..." : "Uploading image...");
  const uploadRes = await fetch("/api/snapchat/media/upload-from-blob", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobUrl, mediaId, adAccountId, fileName: safeName }),
  });
  const uploadData = await safeJson(uploadRes);
  if (uploadData.error) throw new Error(uploadData.error);

  return mediaId;
}

export async function uploadMediaToSnapchat(
  file: File,
  adAccountId: string,
  mediaType: "VIDEO" | "IMAGE",
  onProgress?: (msg: string) => void
): Promise<string> {
  // Create the Snapchat media entity
  // Sanitize the file name: Snapchat rejects names with unicode, spaces, or special chars (E1001).
  const safeName = file.name
    .replace(/[^a-zA-Z0-9._\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 100) || "media";
  onProgress?.("Creating media entity...");
  const entityRes = await fetch("/api/snapchat/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adAccountId, name: safeName, type: mediaType }),
  });
  const entityData = await safeJson(entityRes);
  if (entityData.error) throw new Error(entityData.error);
  const { mediaId } = entityData as { mediaId: string };

  if (mediaType === "VIDEO" && file.size > SIMPLE_UPLOAD_MAX) {
    // Large video (> 4 MB): chunked upload + poll.
    await uploadChunked(file, mediaId, safeName, adAccountId, onProgress);

    // Poll until Snapchat finishes processing.
    // Each call to /api/snapchat/media/poll is a single status check (fast).
    // The retry loop lives here so we never hold a serverless function open.
    const maxAttempts = 150; // 150 × 2s = 5 min
    let ready = false;
    for (let i = 0; i < maxAttempts; i++) {
      onProgress?.(`Processing video… (${i + 1}/${maxAttempts})`);
      const pollRes = await fetch("/api/snapchat/media/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, adAccountId }),
      });
      const pollData = await safeJson(pollRes);
      if (pollData.error) throw new Error(pollData.error);
      if (pollData.status === "READY") { ready = true; break; }
      if (pollData.status === "FAILED") throw new Error("Media upload failed on Snapchat side");
      if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, 2000));
    }
    // Upload succeeded but Snapchat didn't finish processing within the window.
    // Throw PollTimeoutError so the caller can store the mediaId and show a Check button.
    if (!ready) throw new PollTimeoutError(mediaId);
  } else {
    // Small video (≤ 4 MB) or image: single direct upload.
    // Snapchat marks the media READY immediately after this endpoint returns — no polling needed.
    onProgress?.(mediaType === "VIDEO" ? "Uploading video..." : "Uploading image...");
    const form = new FormData();
    form.append("file", file);
    form.append("mediaId", mediaId);
    form.append("adAccountId", adAccountId);
    const uploadRes = await fetch("/api/snapchat/media/upload", {
      method: "POST",
      body: form,
    });
    const uploadData = await safeJson(uploadRes);
    if (uploadData.error) {
      throw new Error(
        uploadData._debug
          ? `${uploadData.error} | debug: ${JSON.stringify(uploadData._debug)}`
          : uploadData.error
      );
    }
  }

  return mediaId;
}
