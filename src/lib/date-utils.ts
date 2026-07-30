/**
 * Calendar-date helpers for the reporting UI.
 *
 * `new Date().toISOString().slice(0, 10)` yields the **UTC** date, which is not the
 * viewer's date. For anyone west of UTC it rolls over early: at 18:00 on Jul 29 in
 * US Pacific (UTC-7) the UTC date is already Jul 30, so the dashboard defaulted to
 * a date the viewer has not reached yet and rendered an empty day.
 *
 * These build the string from the LOCAL calendar fields instead. Server-side code
 * that deliberately works in UTC (the cron windows, Snapchat's stats date math)
 * should keep using UTC and must not switch to these.
 */

/** Today in the viewer's own calendar, as YYYY-MM-DD. */
export function localTodayStr(): string {
  return toLocalDateStr(new Date());
}

/** Format a Date using its local calendar fields, as YYYY-MM-DD. */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** N days before today, in the viewer's own calendar. */
export function localDaysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalDateStr(d);
}

/**
 * Shift a YYYY-MM-DD string by a number of days. Parsed as local noon so the
 * arithmetic cannot be flipped across a day boundary by a DST transition.
 */
export function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(y, m - 1, d, 12, 0, 0);
  base.setDate(base.getDate() + days);
  return toLocalDateStr(base);
}
