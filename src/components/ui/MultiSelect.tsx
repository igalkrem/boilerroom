"use client";

import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function updatePosition() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }

  function handleToggleOpen() {
    if (!open) updatePosition();
    setOpen((v) => !v);
  }

  // Rendered via a portal (below), so the popover isn't clipped by a
  // scrollable ancestor (e.g. a modal's overflow-y-auto content area) —
  // reposition on scroll/resize while open since it's no longer in normal flow.
  useEffect(() => {
    if (!open) return;
    document.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideButton = wrapperRef.current?.contains(target);
      const insidePopover = popoverRef.current?.contains(target);
      if (!insideButton && !insidePopover) setOpen(false);
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

  function selectAll() {
    onChange(options.map((o) => o.value));
  }

  function clearAll() {
    onChange([]);
  }

  const selectedLabels = options
    .filter((o) => value.includes(o.value))
    .map((o) => o.label)
    .join(", ");

  return (
    <div className={clsx("relative flex flex-col gap-1", className)} ref={wrapperRef}>
      {label && <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggleOpen}
        className={clsx(
          "block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm shadow-sm text-left focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500",
          error && "border-red-400 focus:border-red-400 focus:ring-red-400"
        )}
      >
        <span className={selectedLabels ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"}>
          {selectedLabels || "Select countries…"}
        </span>
        <span className="float-right text-gray-400">▾</span>
      </button>
      {open && coords && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: coords.top, left: coords.left, width: Math.max(coords.width, 224) }}
          className="z-50 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg flex flex-col"
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-700 text-xs shrink-0">
            <button type="button" onClick={selectAll} className="text-cyan-600 dark:text-cyan-400 hover:underline">
              Select all
            </button>
            <button type="button" onClick={clearAll} className="text-gray-400 hover:underline">
              Clear all
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
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
        </div>,
        document.body
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
