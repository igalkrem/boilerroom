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
    <div className="flex gap-1.5 flex-wrap bg-gray-100 dark:bg-gray-900/60 rounded-xl p-1">
      <button
        type="button"
        onClick={() => onChange("")}
        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          activeTagId === ""
            ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
            : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        }`}
      >
        All <span className="font-normal opacity-70 tabular-nums">{totalCount}</span>
      </button>
      {tags.map((tag) => {
        const active = activeTagId === tag.id;
        const colors = getTagColorClasses(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onChange(active ? "" : tag.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              active ? colors.active : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
            {tag.name}
            <span className="font-normal opacity-70 tabular-nums">{counts[tag.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
