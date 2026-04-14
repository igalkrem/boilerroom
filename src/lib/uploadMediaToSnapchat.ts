/**
 * Client-side media upload pipeline.
 * Accepts an already-transcoded/resized File and uploads it to Snapchat
 * via our Next.js API routes. Called from the submission orchestrator's
 * "uploadMedia" stage so that all creatives upload in parallel.
 *
 * For video: multipart upload with all chunks sent in parallel (5 MB each),
 * then poll until Snapchat finishes processing.
 * For image: single POST to /api/snapchat/media/upload.
 */

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB — fewer round-trips than 3 MB

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
  onProgress?: (msg: string) => void
): Promise<void> {
  const numChunks = Math.ceil(file.size / CHUNK_SIZE);

  onProgress?.("Initializing upload...");
  const initRes = await fetch("/api/snapchat/media/upload-init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mediaId,
      fileName: file.name,
      fileSize: file.size,
      numberOfParts: numChunks,
    }),
  });
  const initData = await safeJson(initRes);
  if (initData.error) throw new Error(initData.error);
  const { upload_id, add_path, finalize_path } = initData;

  // Upload all chunks in parallel — Snapchat multipart v2 accepts out-of-order parts
  onProgress?.(`Uploading ${numChunks} chunk${numChunks > 1 ? "s" : ""} in parallel...`);
  await Promise.all(
    Array.from({ length: numChunks }, async (_, i) => {
      const start = i * CHUNK_SIZE;
      const chunk = file.slice(start, start + CHUNK_SIZE);

      const form = new FormData();
      form.append("chunk", new File([chunk], file.name));
      form.append("partNumber", String(i + 1));
      form.append("uploadId", upload_id);
      form.append("addPath", add_path);

      const res = await fetch("/api/snapchat/media/upload-chunk", {
        method: "POST",
        body: form,
      });
      const data = await safeJson(res);
      if (data.error) throw new Error(`Chunk ${i + 1}: ${data.error}`);
    })
  );

  onProgress?.("Finalizing upload...");
  const finalRes = await fetch("/api/snapchat/media/upload-finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: upload_id, finalizePath: finalize_path }),
  });
  const finalData = await safeJson(finalRes);
  if (finalData.error) throw new Error(finalData.error);
}

export async function uploadMediaToSnapchat(
  file: File,
  adAccountId: string,
  mediaType: "VIDEO" | "IMAGE",
  onProgress?: (msg: string) => void
): Promise<string> {
  // Create the Snapchat media entity
  onProgress?.("Creating media entity...");
  const entityRes = await fetch("/api/snapchat/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adAccountId, name: file.name, type: mediaType }),
  });
  const entityData = await safeJson(entityRes);
  if (entityData.error) throw new Error(entityData.error);
  const { mediaId } = entityData as { mediaId: string };

  if (mediaType === "VIDEO") {
    await uploadChunked(file, mediaId, onProgress);

    // Poll until Snapchat finishes processing
    onProgress?.("Waiting for Snapchat to process video...");
    const pollRes = await fetch("/api/snapchat/media/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId, adAccountId }),
    });
    const pollData = await safeJson(pollRes);
    if (pollData.error) throw new Error(pollData.error);
  } else {
    // Image: single direct upload
    onProgress?.("Uploading image...");
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
