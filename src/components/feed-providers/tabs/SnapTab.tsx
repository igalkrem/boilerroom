"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui";
import { loadAdAccountConfigs } from "@/lib/adAccounts";
import type { FeedProvider, NamingSegment } from "@/types/feed-provider";
import { loadPixels } from "@/lib/pixels";
import { UrlParametersTab } from "./UrlParametersTab";

// ─── Naming template ──────────────────────────────────────────────────────────

const NAMING_MACROS = [
  { key: "preset.tag",   label: "Preset Tag",   description: "Value from the preset's Tag field" },
  { key: "article.name", label: "Article Name", description: "Article slug / keyword" },
  { key: "date_ddmm",    label: "Date (DDMM)",  description: "e.g. 3004 for 30 April" },
  { key: "unique_id_4",  label: "Unique ID",    description: "Random 4-char alphanumeric, generated per campaign" },
];

function resolvePreview(segments: NamingSegment[]): string {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  return segments
    .map((seg) => {
      if (seg.type === "literal") return seg.value || "…";
      switch (seg.value) {
        case "preset.tag":   return "T1";
        case "article.name": return "demo-article";
        case "date_ddmm":    return `${dd}${mm}`;
        case "unique_id_4":  return "A3X9";
        case "preset.name":  return "My Preset";
        case "index":        return "1";
        default:             return seg.value;
      }
    })
    .filter(Boolean)
    .join(" | ");
}

interface NamingTemplateEditorProps {
  segments: NamingSegment[];
  onChange: (segments: NamingSegment[]) => void;
}

function NamingTemplateEditor({ segments, onChange }: NamingTemplateEditorProps) {
  function addMacro(key: string) {
    onChange([...segments, { type: "macro", value: key }]);
  }

  function addLiteral() {
    onChange([...segments, { type: "literal", value: "" }]);
  }

  function removeSegment(idx: number) {
    onChange(segments.filter((_, i) => i !== idx));
  }

  function updateLiteral(idx: number, value: string) {
    onChange(segments.map((seg, i) => (i === idx ? { ...seg, value } : seg)));
  }

  const preview = resolvePreview(segments);

  return (
    <div className="space-y-3">
      {/* Segment row */}
      <div className="flex flex-wrap items-center gap-1.5 min-h-[36px]">
        {segments.length === 0 && (
          <span className="text-xs text-violet-400 italic">
            No segments yet — add a text literal or a macro below
          </span>
        )}
        {segments.map((seg, idx) => (
          <div key={idx} className="flex items-center gap-1">
            {idx > 0 && (
              <span className="text-xs text-violet-300 select-none px-0.5">|</span>
            )}
            {seg.type === "literal" ? (
              <div className="flex items-center gap-1 bg-white border border-violet-200 rounded-lg px-2 py-1">
                <input
                  type="text"
                  value={seg.value}
                  onChange={(e) => updateLiteral(idx, e.target.value)}
                  placeholder="text…"
                  className="text-xs text-gray-700 outline-none bg-transparent"
                  style={{ width: `${Math.max(48, (seg.value.length + 3) * 7)}px` }}
                />
                <button
                  type="button"
                  onClick={() => removeSegment(idx)}
                  className="text-violet-300 hover:text-violet-600 text-xs leading-none ml-0.5"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-violet-100 border border-violet-200 rounded-lg px-2 py-1">
                <span className="text-xs font-medium text-violet-700">
                  {NAMING_MACROS.find((m) => m.key === seg.value)?.label ?? seg.value}
                </span>
                <button
                  type="button"
                  onClick={() => removeSegment(idx)}
                  className="text-violet-300 hover:text-violet-600 text-xs leading-none ml-0.5"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-violet-500 font-medium">+ Add:</span>
        <button
          type="button"
          onClick={addLiteral}
          className="px-2 py-1 text-xs bg-white border border-violet-200 text-violet-600 rounded-lg hover:bg-violet-50 font-medium"
        >
          Text
        </button>
        {NAMING_MACROS.map((m) => (
          <button
            key={m.key}
            type="button"
            title={m.description}
            onClick={() => addMacro(m.key)}
            className="px-2 py-1 text-xs bg-violet-100 border border-violet-200 text-violet-700 rounded-lg hover:bg-violet-200 font-medium"
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Live preview */}
      {segments.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-violet-500 font-medium shrink-0">Preview:</span>
          <span className="font-mono text-xs bg-white rounded-lg px-3 py-1.5 border border-violet-100 text-violet-700 truncate">
            {preview}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── SnapTab ──────────────────────────────────────────────────────────────────

interface SnapTabProps {
  snapConfig: FeedProvider["snapConfig"];
  onChange: (config: FeedProvider["snapConfig"]) => void;
  urlConfig: FeedProvider["urlConfig"];
  onUrlConfigChange: (config: FeedProvider["urlConfig"]) => void;
}

export function SnapTab({ snapConfig, onChange, urlConfig, onUrlConfigChange }: SnapTabProps) {
  const [assignedAccountNames, setAssignedAccountNames] = useState<Array<{ id: string; name: string }>>([]);
  const [pixelOptions, setPixelOptions] = useState<Array<{ id: string; name: string; pixelId: string }>>([]);

  useEffect(() => {
    setPixelOptions(loadPixels().map((p) => ({ id: p.id, name: p.name, pixelId: p.pixelId })));

    // Show accounts assigned to this provider (managed from Traffic Sources)
    const configs = loadAdAccountConfigs();
    const assigned = configs
      .filter((c) => snapConfig.allowedAdAccountIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    // Also show IDs that don't have a config entry yet (fallback)
    const configIds = new Set(configs.map((c) => c.id));
    const unknownIds = snapConfig.allowedAdAccountIds
      .filter((id) => !configIds.has(id))
      .map((id) => ({ id, name: id }));
    setAssignedAccountNames([...assigned, ...unknownIds]);
  }, [snapConfig.allowedAdAccountIds]);

  function togglePixel(id: string) {
    const current = snapConfig.allowedPixelIds;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onChange({ ...snapConfig, allowedPixelIds: next });
  }

  const namingTemplate = snapConfig.campaignNamingTemplate ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Input
          label="Snapchat Organization ID"
          placeholder="e.g. 0a1b2c3d-..."
          value={snapConfig.organizationId ?? ""}
          onChange={(e) => onChange({ ...snapConfig, organizationId: e.target.value })}
        />
        <p className="text-xs text-gray-400 mt-1">
          Found in Snapchat Business Manager → Organization Settings. Resolves{" "}
          <code className="bg-gray-100 px-1 rounded">{"{{organization_id}}"}</code> in URL templates.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">Assigned Ad Accounts</p>
          <Link
            href="/dashboard/traffic-sources"
            className="text-xs text-cyan-600 hover:text-cyan-700 underline"
          >
            Manage in Traffic Sources →
          </Link>
        </div>
        {assignedAccountNames.length === 0 ? (
          <p className="text-xs text-gray-400">
            No ad accounts assigned yet.{" "}
            <Link href="/dashboard/traffic-sources" className="text-cyan-600 hover:underline">
              Assign accounts in Traffic Sources.
            </Link>
          </p>
        ) : (
          <div className="space-y-1 border border-gray-200 rounded-lg p-2 bg-gray-50">
            {assignedAccountNames.map((acc) => (
              <div key={acc.id} className="flex items-center gap-2 px-1.5 py-1">
                <span className="w-2 h-2 rounded-full bg-cyan-500 shrink-0" />
                <span className="text-sm text-gray-800">{acc.name}</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">{acc.id.slice(0, 8)}…</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Allowed Pixels</p>
        {pixelOptions.length === 0 ? (
          <p className="text-xs text-gray-400">
            No pixels saved.{" "}
            <Link href="/dashboard/traffic-sources" className="text-blue-500 hover:underline">
              Add pixels in Traffic Sources.
            </Link>
          </p>
        ) : (
          <div className="space-y-1 border border-gray-200 rounded-lg p-2">
            {pixelOptions.map((px) => (
              <label key={px.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={snapConfig.allowedPixelIds.includes(px.id)}
                  onChange={() => togglePixel(px.id)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-800">{px.name}</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">{px.pixelId.slice(0, 10)}…</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <hr className="border-gray-100" />

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">URL Parameters</h3>
        <UrlParametersTab
          urlConfig={urlConfig}
          onChange={onUrlConfigChange}
          hideBaseUrl
        />
      </div>

      <hr className="border-gray-100" />

      {/* Campaign Naming Template */}
      <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <h3 className="text-sm font-semibold text-violet-800">Campaign Naming Template</h3>
        </div>
        <p className="text-xs text-violet-600">
          Defines how campaign, ad set, and ad names are generated for Snap campaigns under this provider.
          Segments are joined with{" "}
          <code className="bg-white px-1 rounded border border-violet-100 font-mono"> | </code>.
          Overrides the global template in Review &amp; Launch.
        </p>
        <NamingTemplateEditor
          segments={namingTemplate}
          onChange={(t) => onChange({ ...snapConfig, campaignNamingTemplate: t })}
        />
      </div>
    </div>
  );
}
