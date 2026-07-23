"use client";

import { useState } from "react";

interface MediaItem {
  key: string;
  type: "image" | "video";
  url: string;
  filename: string;
}

interface AdStatus {
  adId: string;
  adName?: string;
  error?: "not_found" | "forbidden";
}

interface PreviewResponse {
  ads: AdStatus[];
  items: MediaItem[];
  truncated: boolean;
  unresolvedCount: number;
}

function parseAdIds(raw: string): string[] {
  return [...new Set(raw.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean))];
}

export default function AdMediaPage() {
  const [adIdsRaw, setAdIdsRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const adIds = parseAdIds(adIdsRaw);

  const fetchMedia = async () => {
    if (adIds.length === 0) return;
    const query = adIds.join(",");
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch(`/api/meta/ad-media?adIds=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok && !data.ads) {
        setErr(data.error ?? "Failed to fetch ad media");
        return;
      }
      setResult(data as PreviewResponse);
      setLastQuery(query);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const foundCount = result?.ads.filter((a) => !a.error).length ?? 0;
  const errorAds = result?.ads.filter((a) => a.error) ?? [];

  return (
    <div className="p-8 max-w-3xl mx-auto text-gray-100">
      <h1 className="text-xl font-semibold mb-2">Ad Media Downloader</h1>
      <p className="text-sm text-gray-400 mb-6">
        Enter one or more Meta Ad IDs — one per line, or comma-separated on a single line — to fetch every
        image/video used by those ads and download the unique files all at once.
      </p>

      <div className="mb-6">
        <textarea
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 font-mono text-sm"
          rows={5}
          placeholder={"Ad IDs, one per line or comma-separated, e.g.\n120251719284310745\n120250402621500598, 120252957783300745"}
          value={adIdsRaw}
          onChange={(e) => setAdIdsRaw(e.target.value)}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-500">
            {adIds.length} ad ID{adIds.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={fetchMedia}
            disabled={loading || adIds.length === 0}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded"
          >
            {loading ? "Fetching…" : "Fetch"}
          </button>
        </div>
      </div>

      {err && <div className="text-red-400 mb-4">{err}</div>}

      {result && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">
              {foundCount} of {result.ads.length} ad{result.ads.length === 1 ? "" : "s"} found — {result.items.length}{" "}
              unique file{result.items.length === 1 ? "" : "s"}
            </h2>
            {result.items.length > 0 && (
              <a
                href={`/api/meta/ad-media?adIds=${encodeURIComponent(lastQuery)}&download=1`}
                download
                className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm"
              >
                Download All ({result.items.length})
              </a>
            )}
          </div>

          {errorAds.length > 0 && (
            <div className="text-red-400 text-sm mb-3">
              Couldn&apos;t access: {errorAds.map((a) => `${a.adId} (${a.error})`).join(", ")}
            </div>
          )}
          {result.truncated && (
            <div className="text-yellow-400 text-sm mb-3">
              More media was found than can be shown at once — only the first {result.items.length} unique items are
              listed.
            </div>
          )}
          {result.unresolvedCount > 0 && (
            <div className="text-yellow-400 text-sm mb-3">
              {result.unresolvedCount} item{result.unresolvedCount === 1 ? "" : "s"} could not be resolved and will be
              skipped.
            </div>
          )}

          {result.items.length === 0 ? (
            <div className="text-gray-400 text-sm">No media found.</div>
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
