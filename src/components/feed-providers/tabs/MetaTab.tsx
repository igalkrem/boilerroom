"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FeedProvider, NamingSegment } from "@/types/feed-provider";
import { loadAdAccountConfigs } from "@/lib/adAccounts";

const NAMING_MACROS = [
  { key: "preset.tag",     label: "Preset Tag",       description: "Value from the preset's Tag field" },
  { key: "article.name",   label: "Article Name",     description: "Article slug / keyword" },
  { key: "date_ddmm",      label: "Date (DDMM)",      description: "e.g. 3004 for 30 April" },
  { key: "unique_id_4",    label: "Unique ID",        description: "Random 4-char alphanumeric" },
  { key: "creative.vname", label: "Creative Version", description: "Version label from asset tag" },
  { key: "channel.id",     label: "Channel ID",       description: "Assigned channel ID" },
];

function resolvePreview(segments: NamingSegment[]): string {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  return segments
    .map((seg) => {
      if (seg.type === "literal") return seg.value || "…";
      switch (seg.value) {
        case "preset.tag":      return "T1";
        case "article.name":    return "demo-article";
        case "date_ddmm":       return `${dd}${mm}`;
        case "unique_id_4":     return "A3X9";
        case "creative.vname":  return "V1";
        case "channel.id":      return "{{channel.id}}";
        default:                return seg.value;
      }
    })
    .filter(Boolean)
    .join(" | ");
}

type MetaConfig = NonNullable<FeedProvider["metaConfig"]>;

interface MetaTabProps {
  metaConfig: MetaConfig;
  onChange: (config: MetaConfig) => void;
}

export function MetaTab({ metaConfig, onChange }: MetaTabProps) {
  const [assignedAccountNames, setAssignedAccountNames] = useState<Array<{ id: string; name: string }>>([]);
  const [pages, setPages] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const configs = loadAdAccountConfigs();
    const assigned = configs
      .filter((c) => metaConfig.allowedAdAccountIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    const configIds = new Set(configs.map((c) => c.id));
    const unknownIds = metaConfig.allowedAdAccountIds
      .filter((id) => !configIds.has(id))
      .map((id) => ({ id, name: id }));
    setAssignedAccountNames([...assigned, ...unknownIds]);
  }, [metaConfig.allowedAdAccountIds]);

  useEffect(() => {
    fetch("/api/meta/pages")
      .then((r) => (r.ok ? r.json() : { pages: [] }))
      .then((data) => setPages(data.pages ?? []))
      .catch(() => setPages([]));
  }, []);

  const namingTemplate = metaConfig.campaignNamingTemplate ?? [];

  return (
    <div className="space-y-6">
      {/* Assigned Ad Accounts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Assigned Meta Ad Accounts</p>
          <Link
            href="/dashboard/traffic-sources"
            className="text-xs text-blue-600 hover:text-blue-700 underline"
          >
            Manage in Traffic Sources →
          </Link>
        </div>
        {assignedAccountNames.length === 0 ? (
          <p className="text-xs text-gray-400">
            No Meta ad accounts assigned yet.{" "}
            <Link href="/dashboard/traffic-sources" className="text-blue-600 hover:underline">
              Assign accounts in Traffic Sources.
            </Link>
          </p>
        ) : (
          <div className="space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
            {assignedAccountNames.map((acc) => (
              <div key={acc.id} className="flex items-center gap-2 px-1.5 py-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="text-sm text-gray-800 dark:text-gray-200">{acc.name}</span>
                <span className="text-xs text-gray-400 font-mono ml-auto">{acc.id.slice(0, 12)}…</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Facebook Pages — assigned + ad-limit-driven in Traffic Sources */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Facebook Pages</p>
          <Link
            href="/dashboard/traffic-sources"
            className="text-xs text-blue-600 hover:text-blue-700 underline"
          >
            Manage in Traffic Sources →
          </Link>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Ads publish from the assigned page with the most ads remaining. Assign pages and view ad
          limits in Traffic Sources.
        </p>
        {(() => {
          const assignedIds =
            metaConfig.allowedPageIds && metaConfig.allowedPageIds.length > 0
              ? metaConfig.allowedPageIds
              : metaConfig.pageId
              ? [metaConfig.pageId]
              : [];
          if (assignedIds.length === 0) {
            return (
              <p className="text-xs text-gray-400">
                No pages assigned yet.{" "}
                <Link href="/dashboard/traffic-sources" className="text-blue-600 hover:underline">
                  Assign pages in Traffic Sources.
                </Link>
              </p>
            );
          }
          return (
            <div className="space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
              {assignedIds.map((pid) => {
                const name = pages.find((p) => p.id === pid)?.name ?? pid;
                return (
                  <div key={pid} className="flex items-center gap-2 px-1.5 py-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-sm text-gray-800 dark:text-gray-200">{name}</span>
                    <span className="text-xs text-gray-400 font-mono ml-auto">{pid}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Campaign Naming Template */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-400">Campaign Naming Template</h3>
        </div>
        <p className="text-xs text-blue-600 dark:text-blue-400">
          Defines how campaign and ad set names are generated for Meta campaigns under this provider.
          Segments are joined with{" "}
          <code className="bg-white px-1 rounded border border-blue-100 font-mono"> | </code>.
        </p>
        <div className="space-y-3">
          {/* Segment row */}
          <div className="flex flex-wrap items-center gap-1.5 min-h-[36px]">
            {namingTemplate.length === 0 && (
              <span className="text-xs text-blue-400 italic">
                No segments yet — add a text literal or a macro below
              </span>
            )}
            {namingTemplate.map((seg, idx) => (
              <div key={idx} className="flex items-center gap-1">
                {idx > 0 && <span className="text-xs text-blue-300 select-none px-0.5">|</span>}
                {seg.type === "literal" ? (
                  <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-blue-200 rounded-lg px-2 py-1">
                    <input
                      type="text"
                      value={seg.value}
                      onChange={(e) => {
                        const updated = namingTemplate.map((s, i) => (i === idx ? { ...s, value: e.target.value } : s));
                        onChange({ ...metaConfig, campaignNamingTemplate: updated });
                      }}
                      placeholder="text…"
                      className="text-xs text-gray-700 dark:text-gray-300 outline-none bg-transparent"
                      style={{ width: `${Math.max(48, (seg.value.length + 3) * 7)}px` }}
                    />
                    <button
                      type="button"
                      onClick={() => onChange({ ...metaConfig, campaignNamingTemplate: namingTemplate.filter((_, i) => i !== idx) })}
                      className="text-blue-300 hover:text-blue-600 text-xs leading-none ml-0.5"
                    >×</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 bg-blue-100 border border-blue-200 rounded-lg px-2 py-1">
                    <span className="text-xs font-medium text-blue-700">
                      {NAMING_MACROS.find((m) => m.key === seg.value)?.label ?? seg.value}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange({ ...metaConfig, campaignNamingTemplate: namingTemplate.filter((_, i) => i !== idx) })}
                      className="text-blue-300 hover:text-blue-600 text-xs leading-none ml-0.5"
                    >×</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Add controls */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-blue-500 font-medium">+ Add:</span>
            <button
              type="button"
              onClick={() => onChange({ ...metaConfig, campaignNamingTemplate: [...namingTemplate, { type: "literal", value: "" }] })}
              className="px-2 py-1 text-xs bg-white dark:bg-gray-800 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 font-medium"
            >
              Text
            </button>
            {NAMING_MACROS.map((m) => (
              <button
                key={m.key}
                type="button"
                title={m.description}
                onClick={() => onChange({ ...metaConfig, campaignNamingTemplate: [...namingTemplate, { type: "macro", value: m.key }] })}
                className="px-2 py-1 text-xs bg-blue-100 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-200 font-medium"
              >
                {m.label}
              </button>
            ))}
          </div>
          {namingTemplate.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-blue-500 font-medium shrink-0">Preview:</span>
              <span className="font-mono text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-blue-100 text-blue-700 dark:text-blue-400 truncate">
                {resolvePreview(namingTemplate)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
