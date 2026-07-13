"use client";

import type { NamingSegment } from "@/types/feed-provider";

export const NAMING_MACROS = [
  { key: "preset.tag",      label: "Preset Tag",       description: "Value from the preset's Tag field" },
  { key: "article.name",    label: "Article Name",     description: "Article slug / keyword" },
  { key: "date_ddmm",       label: "Date (DDMM)",      description: "e.g. 3004 for 30 April" },
  { key: "unique_id_4",     label: "Unique ID",        description: "Random 4-char alphanumeric, generated per campaign" },
  { key: "creative.vname",  label: "Creative Version", description: "Version label from asset tag (e.g. V1, V2)" },
  { key: "channel.id",      label: "Channel ID",       description: "Assigned channel ID for this campaign" },
];

export function resolveNamingPreview(segments: NamingSegment[]): string {
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
        case "unique_id_4":     return "A3X9";
        case "creative.vname":  return "V1";
        case "channel.id":      return "{{channel.id}}";
        case "preset.name":  return "My Preset";
        case "index":        return "1";
        default:             return seg.value;
      }
    })
    .filter(Boolean)
    .join(" | ");
}

// Static class sets so Tailwind can see the full names for each theme.
const THEMES = {
  violet: {
    sep: "text-violet-300",
    literalBox: "border-violet-200",
    x: "text-violet-300 hover:text-violet-600",
    macroBox: "bg-violet-100 border-violet-200",
    macroText: "text-violet-700",
    addLabel: "text-violet-500",
    textBtn: "border-violet-200 text-violet-600 hover:bg-violet-50",
    macroBtn: "bg-violet-100 border-violet-200 text-violet-700 hover:bg-violet-200",
    previewLabel: "text-violet-500",
    previewBox: "border-violet-100 text-violet-700 dark:text-violet-400",
    empty: "text-violet-400",
  },
  blue: {
    sep: "text-blue-300",
    literalBox: "border-blue-200",
    x: "text-blue-300 hover:text-blue-600",
    macroBox: "bg-blue-100 border-blue-200",
    macroText: "text-blue-700",
    addLabel: "text-blue-500",
    textBtn: "border-blue-200 text-blue-600 hover:bg-blue-50",
    macroBtn: "bg-blue-100 border-blue-200 text-blue-700 hover:bg-blue-200",
    previewLabel: "text-blue-500",
    previewBox: "border-blue-100 text-blue-700 dark:text-blue-400",
    empty: "text-blue-400",
  },
} as const;

interface NamingTemplateEditorProps {
  segments: NamingSegment[];
  onChange: (segments: NamingSegment[]) => void;
  theme?: "violet" | "blue";
}

export function NamingTemplateEditor({ segments, onChange, theme = "violet" }: NamingTemplateEditorProps) {
  const t = THEMES[theme];

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

  const preview = resolveNamingPreview(segments);

  return (
    <div className="space-y-3">
      {/* Segment row */}
      <div className="flex flex-wrap items-center gap-1.5 min-h-[36px]">
        {segments.length === 0 && (
          <span className={`text-xs italic ${t.empty}`}>
            No segments yet — add a text literal or a macro below
          </span>
        )}
        {segments.map((seg, idx) => (
          <div key={idx} className="flex items-center gap-1">
            {idx > 0 && <span className={`text-xs select-none px-0.5 ${t.sep}`}>|</span>}
            {seg.type === "literal" ? (
              <div className={`flex items-center gap-1 bg-white dark:bg-gray-800 border rounded-lg px-2 py-1 ${t.literalBox}`}>
                <input
                  type="text"
                  value={seg.value}
                  onChange={(e) => updateLiteral(idx, e.target.value)}
                  placeholder="text…"
                  className="text-xs text-gray-700 dark:text-gray-300 outline-none bg-transparent"
                  style={{ width: `${Math.max(48, (seg.value.length + 3) * 7)}px` }}
                />
                <button type="button" onClick={() => removeSegment(idx)} className={`text-xs leading-none ml-0.5 ${t.x}`}>×</button>
              </div>
            ) : (
              <div className={`flex items-center gap-1 border rounded-lg px-2 py-1 ${t.macroBox}`}>
                <span className={`text-xs font-medium ${t.macroText}`}>
                  {NAMING_MACROS.find((m) => m.key === seg.value)?.label ?? seg.value}
                </span>
                <button type="button" onClick={() => removeSegment(idx)} className={`text-xs leading-none ml-0.5 ${t.x}`}>×</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-medium ${t.addLabel}`}>+ Add:</span>
        <button
          type="button"
          onClick={addLiteral}
          className={`px-2 py-1 text-xs bg-white dark:bg-gray-800 border rounded-lg font-medium ${t.textBtn}`}
        >
          Text
        </button>
        {NAMING_MACROS.map((m) => (
          <button
            key={m.key}
            type="button"
            title={m.description}
            onClick={() => addMacro(m.key)}
            className={`px-2 py-1 text-xs border rounded-lg font-medium ${t.macroBtn}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Live preview */}
      {segments.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <span className={`text-xs font-medium shrink-0 ${t.previewLabel}`}>Preview:</span>
          <span className={`font-mono text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border truncate ${t.previewBox}`}>
            {preview}
          </span>
        </div>
      )}
    </div>
  );
}
