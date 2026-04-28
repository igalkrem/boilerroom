"use client";

import { useRef, useEffect, useState } from "react";
import { clsx } from "clsx";

interface MultiSelectProps {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}

export function MultiSelect({ label, error, options, value, onChange, className }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(code: string) {
    if (value.includes(code)) {
      onChange(value.filter((v) => v !== code));
    } else {
      onChange([...value, code]);
    }
  }

  const selectedLabels = options
    .filter((o) => value.includes(o.value))
    .map((o) => o.label)
    .join(", ");

  return (
    <div className={clsx("relative flex flex-col gap-1", className)} ref={ref}>
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm text-left focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500",
          error && "border-red-400 focus:border-red-400 focus:ring-red-400"
        )}
      >
        <span className={selectedLabels ? "text-gray-900" : "text-gray-400"}>
          {selectedLabels || "Select countries…"}
        </span>
        <span className="float-right text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-md border border-gray-200 bg-white shadow-lg">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400"
                checked={value.includes(o.value)}
                onChange={() => toggle(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
