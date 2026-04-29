"use client";

import { useRef } from "react";
import { Input } from "@/components/ui";
import type { FeedProvider, UrlParameter } from "@/types/feed-provider";

const MACROS = [
  { label: "{{campaign.id}}", title: "Snap campaign ID" },
  { label: "{{adSet.id}}", title: "Snap ad set ID" },
  { label: "{{ad.id}}", title: "Snap ad ID (injected after creation)" },
  { label: "{{organization_id}}", title: "Snap org ID" },
  { label: "{{channel.id}}", title: "Assigned channel ID" },
  { label: "{{article.name}}", title: "Article name" },
  { label: "{{article.query}}", title: "Article search keyword" },
  { label: "{{creative.headline}}", title: "Creative headline" },
  { label: "{{creative.rac}}", title: "Headline RAC value" },
];

interface UrlParametersTabProps {
  urlConfig: FeedProvider["urlConfig"];
  onChange: (config: FeedProvider["urlConfig"]) => void;
  hideBaseUrl?: boolean;
}

export function UrlParametersTab({ urlConfig, onChange, hideBaseUrl }: UrlParametersTabProps) {
  const lastActiveIndexRef = useRef<number | null>(null);
  const valueRefs = useRef<Array<HTMLInputElement | null>>([]);

  function updateParam(index: number, field: keyof UrlParameter, value: string) {
    const next = urlConfig.parameters.map((p, i) =>
      i === index ? { ...p, [field]: value } : p
    );
    onChange({ ...urlConfig, parameters: next });
  }

  function addRow() {
    onChange({
      ...urlConfig,
      parameters: [...urlConfig.parameters, { key: "", value: "" }],
    });
  }

  function removeRow(index: number) {
    onChange({
      ...urlConfig,
      parameters: urlConfig.parameters.filter((_, i) => i !== index),
    });
  }

  function insertMacro(macro: string) {
    const index = lastActiveIndexRef.current;
    if (index === null) return;
    const input = valueRefs.current[index];
    const param = urlConfig.parameters[index];
    if (!param) return;

    const start = input?.selectionStart ?? param.value.length;
    const end = input?.selectionEnd ?? param.value.length;
    const next = param.value.slice(0, start) + macro + param.value.slice(end);
    updateParam(index, "value", next);

    requestAnimationFrame(() => {
      input?.focus();
      const pos = start + macro.length;
      input?.setSelectionRange(pos, pos);
    });
  }

  const usedMacroLabels = new Set(
    MACROS
      .filter(m => urlConfig.parameters.some(p => p.value.includes(m.label)))
      .map(m => m.label)
  );
  const availableMacros = MACROS.filter(m => !usedMacroLabels.has(m.label));

  const previewUrl = (() => {
    const base = (urlConfig.baseUrl ?? "").replace(/\/$/, "");
    const params = urlConfig.parameters
      .filter((p) => p.key)
      .map((p) => `${p.key}=${p.value}`)
      .join("&");
    return params ? `${base}?${params}` : base;
  })();

  return (
    <div className="space-y-5">
      {!hideBaseUrl && (
        <Input
          label="Base URL"
          placeholder="https://example.com/lp"
          value={urlConfig.baseUrl ?? ""}
          onChange={(e) => onChange({ ...urlConfig, baseUrl: e.target.value })}
        />
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">URL Parameters</p>
          <button
            type="button"
            onClick={addRow}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            + Add parameter
          </button>
        </div>

        <div className="space-y-2">
          {urlConfig.parameters.map((param, i) => (
            <div key={i}>
              <div className="flex gap-2 items-start">
                <input
                  type="text"
                  placeholder="key"
                  value={param.key}
                  onChange={(e) => updateParam(i, "key", e.target.value)}
                  className="w-32 shrink-0 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <span className="text-gray-400 mt-1.5 text-sm">=</span>
                <div className="flex-1">
                  <input
                    ref={(el) => { valueRefs.current[i] = el; }}
                    type="text"
                    placeholder="value or {{macro}}"
                    value={param.value}
                    onChange={(e) => updateParam(i, "value", e.target.value)}
                    onFocus={() => { lastActiveIndexRef.current = i; }}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-gray-300 hover:text-red-500 mt-1.5 shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {availableMacros.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Available Macros</p>
          <div className="flex flex-wrap gap-1.5">
            {availableMacros.map((m) => (
              <button
                key={m.label}
                type="button"
                title={m.title}
                onMouseDown={(e) => { e.preventDefault(); insertMacro(m.label); }}
                className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100 font-mono whitespace-nowrap"
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {(previewUrl || !hideBaseUrl) && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Preview URL</p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-xs break-all text-gray-700 leading-relaxed">
            {previewUrl ? (
              previewUrl.split(/({{[^}]+}})/).map((part, i) =>
                part.startsWith("{{") ? (
                  <span key={i} className="bg-blue-100 text-blue-700 rounded px-0.5">{part}</span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )
            ) : (
              <span className="text-gray-400 italic">Set a domain Base URL to see preview</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
