"use client";

import { useState, useEffect, useRef } from "react";
import { upload } from "@vercel/blob/client";
import { loadCatalogue, addCatalogueItem, deleteCatalogueItem } from "@/lib/catalogue";
import { formatFileSize } from "@/lib/silo-utils";
import type { CatalogueItem } from "@/types/catalogue";

type UploadState = {
  id: string;
  name: string;
  progress: number;
  error?: string;
};

export default function CataloguePage() {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ url: string; name: string; top: number; left: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setItems(loadCatalogue());
  }, []);

  function reload() {
    setItems(loadCatalogue());
  }

  async function handleFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    for (const file of imageFiles) {
      const id = crypto.randomUUID();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._\-]/g, "_");
      const pathname = `catalogue/${id}-${sanitizedName}`;

      setUploads((prev) => [...prev, { id, name: file.name, progress: 0 }]);

      try {
        const blob = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/api/catalogue/upload",
          multipart: true,
          onUploadProgress: ({ percentage }) => {
            setUploads((prev) =>
              prev.map((u) => (u.id === id ? { ...u, progress: Math.round(percentage) } : u))
            );
          },
        });

        const item: CatalogueItem = {
          id,
          name: file.name,
          fileFormat: file.type,
          fileSize: file.size,
          url: blob.url,
          uploadDate: new Date().toISOString(),
        };
        addCatalogueItem(item);
        reload();
        setUploads((prev) => prev.filter((u) => u.id !== id));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setUploads((prev) =>
          prev.map((u) => (u.id === id ? { ...u, error: message } : u))
        );
      }
    }
  }

  async function handleDelete(item: CatalogueItem) {
    setDeletingId(item.id);
    try {
      const res = await fetch("/api/catalogue/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [item.url] }),
      });
      if (!res.ok) throw new Error("Delete failed");
      deleteCatalogueItem(item.id);
      reload();
    } catch (err) {
      console.error("[catalogue] delete error:", err);
    } finally {
      setDeletingId(null);
    }
  }

  async function copyUrl(item: CatalogueItem) {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopiedId(item.id);
      setTimeout(
        () => setCopiedId((prev) => (prev === item.id ? null : prev)),
        1500
      );
    } catch {}
  }

  function downloadCsv() {
    const header = ["Name", "Format", "Size (bytes)", "Uploaded", "Public URL"];
    const rows = items.map((item) => [
      `"${item.name.replace(/"/g, '""')}"`,
      item.fileFormat,
      String(item.fileSize),
      new Date(item.uploadDate).toISOString(),
      item.url,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalogue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }

  const isEmpty = items.length === 0 && uploads.length === 0;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-gray-900 p-6">
      <div className="max-w-5xl mx-auto w-full space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Catalogue</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Upload product images and copy their public URLs for use in your Snap catalogue.
            </p>
          </div>
          {items.length > 0 && (
            <button
              onClick={downloadCsv}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download CSV
            </button>
          )}
        </div>

        {/* Upload zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors select-none ${
            dragOver
              ? "border-cyan-400 bg-cyan-950/30"
              : "border-gray-700 hover:border-gray-600 hover:bg-gray-800/40"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            // Reset value so the same file can be re-selected after an error
            onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
          />
          <svg
            className="w-10 h-10 mx-auto mb-3 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-300 font-medium">Drop images here or click to browse</p>
          <p className="text-gray-500 text-sm mt-1">JPEG, PNG, WebP, GIF — up to 20 MB each</p>
        </div>

        {/* Per-file upload progress */}
        {uploads.length > 0 && (
          <div className="space-y-2">
            {uploads.map((u) => (
              <div
                key={u.id}
                className="bg-gray-800 rounded-lg px-4 py-3 flex items-center gap-3"
              >
                <span className="text-sm text-gray-300 truncate flex-1 min-w-0">{u.name}</span>
                {u.error ? (
                  <>
                    <span className="text-sm text-red-400 shrink-0">{u.error}</span>
                    <button
                      onClick={() => setUploads((prev) => prev.filter((x) => x.id !== u.id))}
                      className="text-gray-500 hover:text-gray-300 shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 shrink-0 w-36">
                    <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-cyan-400 h-1.5 rounded-full transition-all duration-150"
                        style={{ width: `${u.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right">{u.progress}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {items.length > 0 && (
          <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900/60">
                  <th className="w-14 px-4 py-3" />
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">
                    Name
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
                    Size
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                    Uploaded
                  </th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">
                    Public URL
                  </th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-700/20 transition-colors">
                    {/* Thumbnail */}
                    <td className="px-4 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt={item.name}
                        className="w-10 h-10 object-cover rounded-md bg-gray-700 cursor-zoom-in"
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoverPreview({
                            url: item.url,
                            name: item.name,
                            top: rect.top + rect.height / 2,
                            left: rect.right + 12,
                          });
                        }}
                        onMouseLeave={() => setHoverPreview(null)}
                      />
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3 text-gray-200 font-medium max-w-[160px]">
                      <span className="block truncate">{item.name}</span>
                    </td>

                    {/* Size */}
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell whitespace-nowrap">
                      {formatFileSize(item.fileSize)}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-gray-400 hidden md:table-cell whitespace-nowrap">
                      {new Date(item.uploadDate).toLocaleDateString()}
                    </td>

                    {/* URL + copy */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-gray-400 text-xs font-mono truncate max-w-[220px]">
                          {item.url}
                        </span>
                        <button
                          onClick={() => copyUrl(item)}
                          title="Copy URL"
                          className="shrink-0 p-1 rounded text-gray-400 hover:text-cyan-400 transition-colors"
                        >
                          {copiedId === item.id ? (
                            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Delete */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.id}
                        title="Delete"
                        className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        {deletingId === item.id ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <p className="text-center text-sm text-gray-500 py-8">
            No images uploaded yet — drop some above to get started.
          </p>
        )}
      </div>

      {/* Hover preview — fixed so it escapes the table's overflow:hidden */}
      {hoverPreview && (
        <div
          className="fixed z-50 pointer-events-none -translate-y-1/2"
          style={{ top: hoverPreview.top, left: hoverPreview.left }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hoverPreview.url}
            alt={hoverPreview.name}
            className="w-52 h-52 object-contain rounded-xl shadow-2xl border border-gray-700 bg-gray-900"
          />
        </div>
      )}
    </div>
  );
}
