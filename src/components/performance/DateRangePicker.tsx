"use client";

import { useState, useRef, useEffect } from "react";

// ── Date utilities ──────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay(); // 0 = Sunday
}

function formatDisplay(start: string, end: string) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (start === end) return `${months[sm - 1]} ${sd}, ${sy}`;
  if (sy === ey) return `${months[sm - 1]} ${sd} – ${months[em - 1]} ${ed}, ${ey}`;
  return `${months[sm - 1]} ${sd}, ${sy} – ${months[em - 1]} ${ed}, ${ey}`;
}

function monthName(month: number) {
  return ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"][month - 1];
}

function thisMonthStart() {
  const now = new Date();
  return toDateStr(now.getFullYear(), now.getMonth() + 1, 1);
}

function lastMonthRange(): [string, string] {
  const now = new Date();
  const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ld = new Date(now.getFullYear(), now.getMonth(), 0);
  return [
    toDateStr(lm.getFullYear(), lm.getMonth() + 1, 1),
    toDateStr(ld.getFullYear(), ld.getMonth() + 1, ld.getDate()),
  ];
}

// ── Presets ─────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Today",        getRange: (): [string, string] => { const t = todayStr(); return [t, t]; } },
  { label: "Yesterday",    getRange: (): [string, string] => { const y = daysAgo(1); return [y, y]; } },
  { label: "Last 7 days",  getRange: (): [string, string] => [daysAgo(6), todayStr()] },
  { label: "Last 14 days", getRange: (): [string, string] => [daysAgo(13), todayStr()] },
  { label: "Last 30 days", getRange: (): [string, string] => [daysAgo(29), todayStr()] },
  { label: "This month",   getRange: (): [string, string] => [thisMonthStart(), todayStr()] },
  { label: "Last month",   getRange: (): [string, string] => lastMonthRange() },
  { label: "Last 90 days", getRange: (): [string, string] => [daysAgo(89), todayStr()] },
];

function getActivePresetLabel(start: string, end: string): string | null {
  for (const p of PRESETS) {
    const [ps, pe] = p.getRange();
    if (ps === start && pe === end) return p.label;
  }
  return null;
}

// ── CalendarMonth ────────────────────────────────────────────────────────────

interface CalendarMonthProps {
  year: number;
  month: number;
  rangeStart: string;
  rangeEnd: string;
  onClick: (date: string) => void;
  onHover: (date: string | null) => void;
  showPrevArrow?: boolean;
  showNextArrow?: boolean;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
}

function CalendarMonth({
  year, month, rangeStart, rangeEnd,
  onClick, onHover,
  showPrevArrow, showNextArrow, onPrevMonth, onNextMonth,
}: CalendarMonthProps) {
  const today = todayStr();
  const firstDay = getFirstDayOfWeek(year, month);
  const daysInMonth = getDaysInMonth(year, month);

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateStr(year, month, d));
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  function cellClass(date: string) {
    const isStart = date === rangeStart;
    const isEnd = date === rangeEnd;
    const inRange = rangeStart !== rangeEnd && date > rangeStart && date < rangeEnd;
    const isToday = date === today;
    if (isStart || isEnd) {
      return "bg-cyan-500 text-white rounded-full font-semibold hover:bg-cyan-600";
    }
    if (inRange) {
      return "bg-cyan-100 dark:bg-cyan-900/30 text-gray-900 dark:text-gray-100 rounded-none";
    }
    if (isToday) {
      return "border border-cyan-400 text-cyan-700 dark:text-cyan-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700";
    }
    return "text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700";
  }

  return (
    <div
      className="text-xs select-none"
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center justify-between mb-2">
        {showPrevArrow ? (
          <button
            onClick={onPrevMonth}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400 text-base leading-none"
          >
            ‹
          </button>
        ) : <div className="w-6" />}
        <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{monthName(month)} {year}</span>
        {showNextArrow ? (
          <button
            onClick={onNextMonth}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400 text-base leading-none"
          >
            ›
          </button>
        ) : <div className="w-6" />}
      </div>

      <div className="grid grid-cols-7 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="w-8 h-6 flex items-center justify-center font-medium text-gray-400 text-xs">
            {d}
          </div>
        ))}
      </div>

      {rows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-7">
          {row.map((date, ci) => (
            <div
              key={ci}
              className={`w-8 h-8 flex items-center justify-center text-xs ${date ? `cursor-pointer ${cellClass(date)}` : ""}`}
              onClick={date ? () => onClick(date) : undefined}
              onMouseEnter={date ? () => onHover(date) : undefined}
            >
              {date ? parseInt(date.slice(8)) : ""}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── DateRangePicker ──────────────────────────────────────────────────────────

interface Props {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

export function DateRangePicker({ startDate, endDate, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [customDaysToday, setCustomDaysToday] = useState("30");
  const [customDaysYesterday, setCustomDaysYesterday] = useState("30");

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);

  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openPanel() {
    setDraftStart(startDate);
    setDraftEnd(endDate);
    setSelectingEnd(false);
    setHover(null);
    setOpen(true);
  }

  function applyPreset(s: string, e: string) {
    onChange(s, e);
    setOpen(false);
  }

  function handleDayClick(date: string) {
    if (!selectingEnd) {
      setDraftStart(date);
      setDraftEnd(date);
      setSelectingEnd(true);
    } else {
      if (date >= draftStart) {
        setDraftEnd(date);
        setSelectingEnd(false);
      } else {
        // Clicked before start → restart selection
        setDraftStart(date);
        setDraftEnd(date);
      }
    }
  }

  function handleApply() {
    onChange(draftStart, draftEnd);
    setOpen(false);
  }

  function handleCancel() {
    setOpen(false);
  }

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  const prevMonthNum = viewMonth === 1 ? 12 : viewMonth - 1;
  const prevMonthYear = viewMonth === 1 ? viewYear - 1 : viewYear;

  // Compute displayed range (with hover preview while selecting end)
  const displayEnd = selectingEnd && hover && hover >= draftStart ? hover : draftEnd;
  const displayStart = draftStart;

  const activePreset = getActivePresetLabel(startDate, endDate);

  function applyCustomDays(daysStr: string, upToYesterday: boolean) {
    const n = parseInt(daysStr, 10);
    if (!n || n < 1 || n > 90) return;
    const end = upToYesterday ? daysAgo(1) : todayStr();
    const start = upToYesterday ? daysAgo(n) : daysAgo(n - 1);
    applyPreset(start, end);
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={openPanel}
        className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
      >
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {formatDisplay(startDate, endDate)}
        <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex overflow-hidden"
          style={{ minWidth: 560 }}
        >
          {/* Left: Presets */}
          <div className="w-44 shrink-0 border-r border-gray-100 dark:border-gray-700 py-2">
            {PRESETS.map((p) => {
              const [ps, pe] = p.getRange();
              const isActive = activePreset === p.label;
              return (
                <button
                  key={p.label}
                  onClick={() => applyPreset(ps, pe)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    isActive ? "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 font-medium" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}

            <div className="border-t border-gray-100 dark:border-gray-700 mt-2 pt-2 px-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 flex-wrap">
                <input
                  type="number" min={1} max={90}
                  value={customDaysToday}
                  onChange={(e) => setCustomDaysToday(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyCustomDays(customDaysToday, false)}
                  className="w-12 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 bg-white dark:bg-gray-800 dark:text-gray-100"
                />
                <span className="leading-tight">days up to today</span>
                <button
                  onClick={() => applyCustomDays(customDaysToday, false)}
                  className="text-cyan-600 hover:text-cyan-700 font-medium text-xs"
                >
                  Apply
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 flex-wrap">
                <input
                  type="number" min={1} max={90}
                  value={customDaysYesterday}
                  onChange={(e) => setCustomDaysYesterday(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyCustomDays(customDaysYesterday, true)}
                  className="w-12 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 bg-white dark:bg-gray-800 dark:text-gray-100"
                />
                <span className="leading-tight">days up to yest.</span>
                <button
                  onClick={() => applyCustomDays(customDaysYesterday, true)}
                  className="text-cyan-600 hover:text-cyan-700 font-medium text-xs"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>

          {/* Right: Calendar + actions */}
          <div className="flex-1 p-4 flex flex-col">
            <div className="flex gap-6">
              <CalendarMonth
                year={prevMonthYear}
                month={prevMonthNum}
                rangeStart={displayStart}
                rangeEnd={displayEnd}
                onClick={handleDayClick}
                onHover={selectingEnd ? setHover : () => {}}
                showPrevArrow
                onPrevMonth={prevMonth}
              />
              <CalendarMonth
                year={viewYear}
                month={viewMonth}
                rangeStart={displayStart}
                rangeEnd={displayEnd}
                onClick={handleDayClick}
                onHover={selectingEnd ? setHover : () => {}}
                showNextArrow
                onNextMonth={nextMonth}
              />
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {selectingEnd
                  ? "Click to set end date"
                  : formatDisplay(draftStart, draftEnd)}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={selectingEnd}
                  className="px-4 py-1.5 text-sm font-medium bg-cyan-500 text-white rounded-md hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
