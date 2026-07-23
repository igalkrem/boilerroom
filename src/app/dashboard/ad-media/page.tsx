"use client";

import { useState } from "react";

interface MediaItem {
  key: string;
  type: "image" | "video";
  url: string;
  filename: string;
}

interface PreviewResponse {
  adName: string;
  items: MediaItem[];
  truncated: boolean;
  unresolvedCount: number;
}

export default function AdMediaPage() {
  const [adId, setAdId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchMedia = async () => {
    if (!adId) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch(`/api/meta/ad-media?adId=${encodeURIComponent(adId)}`);
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed to fetch ad media");
        return;
      }
      setResult(data as PreviewResponse);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto text-gray-100">
      <h1 className="text-xl font-semibold mb-2">Ad Media Downloader</h1>
      <p className="text-sm text-gray-400 mb-6">
        Enter a Meta Ad ID to fetch every image/video used by that ad and download them all at once.
      </p>

      <div className="flex gap-2 mb-6">
        <input
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2"
          placeholder="Ad ID, e.g. 120251719284310745"
          value={adId}
          onChange={(e) => setAdId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchMedia()}
        />
        <button
          onClick={fetchMedia}
          disabled={loading || !adId}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded"
        >
          {loading ? "Fetching…" : "Fetch"}
        </button>
      </div>

      {err && <div className="text-red-400 mb-4">{err}</div>}

      {result && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">{result.adName}</h2>
            {result.items.length > 0 && (
              <a
                href={`/api/meta/ad-media?adId=${encodeURIComponent(adId)}&download=1`}
                download
                className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm"
              >
                Download All ({result.items.length})
              </a>
            )}
          </div>

          {result.truncated && (
            <div className="text-yellow-400 text-sm mb-3">
              This ad has more media than can be shown at once — only the first {result.items.length} items are listed.
            </div>
          )}
          {result.unresolvedCount > 0 && (
            <div className="text-yellow-400 text-sm mb-3">
              {result.unresolvedCount} item{result.unresolvedCount === 1 ? "" : "s"} could not be resolved and will be
              skipped.
            </div>
          )}

          {result.items.length === 0 ? (
            <div className="text-gray-400 text-sm">No media found on this ad.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {result.items.map((item) => (
                <div key={item.key} className="bg-gray-800 border border-gray-700 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase text-gray-400">{item.type}</span>
                  </div>
                  {item.type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.filename} className="w-full h-32 object-cover rounded mb-2" />
                  ) : (
                    <div className="w-full h-32 flex items-center justify-center bg-gray-900 rounded mb-2 text-gray-500 text-xs">
                      Video
                    </div>
                  )}
                  <p className="text-xs text-gray-400 truncate">{item.filename}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
