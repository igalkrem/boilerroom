// POST /api/meta/media already fetches the blob server-side (images) or hands
// the URL to Meta (video) and awaits processing status before responding, so
// there's no client-side chunking or polling loop needed — one call per
// (asset, ad account) is enough.
export async function uploadBlobToMeta(
  blobUrl: string,
  fileName: string,
  adAccountId: string,
  mediaType: "IMAGE" | "VIDEO"
): Promise<{ imageHash?: string; videoId?: string }> {
  const res = await fetch("/api/meta/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adAccountId,
      type: mediaType,
      blobUrl,
      ...(mediaType === "IMAGE" ? { fileName } : { title: fileName }),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return mediaType === "IMAGE" ? { imageHash: data.imageHash } : { videoId: data.videoId };
}
