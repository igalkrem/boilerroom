"use client";

import { getTagColorClasses } from "@/lib/silo-tags";
import type { SiloTag } from "@/types/silo";

interface TagFilterBarProps {
  tags: SiloTag[];
  activeTagId: string;
  onChange: (tagId: string) => void;
  counts: Record<string, number>;
  totalCount: number;
}

export function TagFilterBar({ tags, activeTagId, onChange, counts, totalCount }: TagFilterBarProps) {
  if (tags.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap bg-gray-100 dark:bg-gray-900/60 rounded-xl p-1.5">
      <button
        type="button"
        onClick={() => onChange("")}
        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm ${
          activeTagId === ""
            ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
            : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600"
        }`}
      >
        All <span className="font-semibold opacity-70 tabular-nums">{totalCount}</span>
      </button>
      {tags.map((tag) => {
        const active = activeTagId === tag.id;
        const colors = getTagColorClasses(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onChange(active ? "" : tag.id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors shadow-sm flex items-center gap-2 ${
              active
                ? colors.active
                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
            {tag.name}
            <span className="font-semibold opacity-70 tabular-nums">{counts[tag.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
