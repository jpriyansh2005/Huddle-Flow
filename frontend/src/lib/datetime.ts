/**
 * Date and time formatting. The backend stores UTC; everything here shows
 * times in the viewer's own timezone, which is what `Date` does by default.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** "10:30 AM" */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "Friday, October 9" */
export function formatLongDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** "Thursday, May 21, 2026", as under the clock on the home screen. */
export function formatLongDateWithYear(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "Good morning" before noon, "Good afternoon" until 6 PM, then "Good evening". */
export function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "Oct 9, 2026" */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Today", "Tomorrow", "Yesterday" or "Mon, Oct 12". */
export function formatDayLabel(date: Date, now: Date = new Date()): string {
  const dayDifference = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS,
  );
  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Tomorrow";
  if (dayDifference === -1) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Heading of the home screen's calendar card: "Today, Oct 9",
 * "Tomorrow, Oct 10", then "Mon, Oct 12" for later days.
 */
export function formatAgendaDate(date: Date, now: Date = new Date()): string {
  const label = formatDayLabel(date, now);
  if (label !== "Today" && label !== "Tomorrow" && label !== "Yesterday") return label;
  return `${label}, ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** "10:00 AM - 10:45 AM" */
export function formatTimeRange(start: Date, durationMinutes: number): string {
  const end = new Date(start.getTime() + durationMinutes * MINUTE_MS);
  return `${formatTime(start)} - ${formatTime(end)}`;
}

/** 45 -> "45 min", 60 -> "1 hr", 90 -> "1 hr 30 min" */
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours} hr`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} min`);
  return parts.join(" ");
}

/** Whole minutes between two moments, never less than one. */
export function minutesBetween(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / MINUTE_MS));
}

/** Seconds as a running clock: 75 -> "01:15", 3725 -> "1:02:05" */
export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** Value for an <input type="date"> in local time: "2026-10-09" */
export function toDateInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Value for a time <select> in local time: "14:30" */
export function toTimeInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Combine "2026-10-09" and "14:30", both in the viewer's timezone, into a
 * Date. Building it from numbers avoids `new Date("2026-10-09")`, which
 * JavaScript reads as UTC midnight and can land on the wrong day.
 */
export function fromDateAndTimeInputs(dateValue: string, timeValue: string): Date {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

/** The next :00 or :30 after `date`: the suggested start of a new meeting. */
export function nextHalfHour(date: Date): Date {
  const result = new Date(date);
  result.setSeconds(0, 0);
  result.setMinutes(result.getMinutes() + (30 - (result.getMinutes() % 30)));
  return result;
}

/** The viewer's timezone, e.g. "Asia/Kolkata". */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Midnight at the start of the given day, in the viewer's timezone. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The same time of day, a number of days later (or earlier, if negative). */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export type DueLabel = { text: string; overdue: boolean };

/**
 * How a due date reads next to an action item: "Due today", "Due tomorrow",
 * "Due Oct 20", or "Overdue: Oct 12". `day` is a calendar day ("2026-10-20")
 * with no time zone, so it is read as that day wherever the viewer is.
 */
export function formatDueDate(day: string, now: Date = new Date()): DueLabel {
  const due = fromDateAndTimeInputs(day, "00:00");
  const difference = Math.round((due.getTime() - startOfDay(now).getTime()) / DAY_MS);
  const short = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (difference < 0) return { text: `Overdue: ${short}`, overdue: true };
  if (difference === 0) return { text: "Due today", overdue: false };
  if (difference === 1) return { text: "Due tomorrow", overdue: false };
  return { text: `Due ${short}`, overdue: false };
}
