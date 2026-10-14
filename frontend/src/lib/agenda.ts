/** Agenda logic with no React: where the meeting is, and how its timer reads. */

import type { AgendaItem } from "./types";

export const MAX_AGENDA_ITEMS = 20;
export const MAX_ITEM_MINUTES = 240;

export type AgendaProgress =
  | { phase: "empty" }
  | { phase: "not-started" }
  | { phase: "running"; item: AgendaItem; index: number; isLast: boolean }
  | { phase: "finished" };

/** Where the meeting is in its agenda. */
export function agendaProgress(items: AgendaItem[]): AgendaProgress {
  if (items.length === 0) return { phase: "empty" };
  const index = items.findIndex((item) => item.started_at !== null && item.ended_at === null);
  if (index >= 0) {
    return { phase: "running", item: items[index], index, isLast: index === items.length - 1 };
  }
  return items.every((item) => item.ended_at !== null)
    ? { phase: "finished" }
    : { phase: "not-started" };
}

export type ItemTiming = {
  elapsedSeconds: number;
  /** Negative once the item runs over its time. */
  remainingSeconds: number;
  /** "ok", then "warn" near the end, then "over" past it. */
  tone: "ok" | "warn" | "over";
};

/** The timer of a started item at the moment `nowMs` (server time). */
export function itemTiming(item: AgendaItem, nowMs: number): ItemTiming {
  const budget = item.duration_minutes * 60;
  const startMs = item.started_at ? Date.parse(item.started_at) : nowMs;
  const endMs = item.ended_at ? Date.parse(item.ended_at) : nowMs;
  const elapsedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const remainingSeconds = budget - elapsedSeconds;
  // Warn in the last minute, or the last quarter of a short item.
  const warnAt = Math.min(60, budget / 4);
  const tone = remainingSeconds < 0 ? "over" : remainingSeconds <= warnAt ? "warn" : "ok";
  return { elapsedSeconds, remainingSeconds, tone };
}

/** "4:05", "0:09", or "-1:30" when over time. */
export function formatCountdown(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const total = Math.abs(seconds);
  return `${sign}${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Planned minutes of the whole agenda. */
export function totalMinutes(items: { duration_minutes: number }[]): number {
  return items.reduce((sum, item) => sum + item.duration_minutes, 0);
}

/** Actual minutes an item took, rounded, once it has both times. */
export function actualMinutes(item: AgendaItem): number | null {
  if (!item.started_at || !item.ended_at) return null;
  return Math.round((Date.parse(item.ended_at) - Date.parse(item.started_at)) / 60_000);
}

/**
 * How far the server's clock is ahead of this browser's, in milliseconds.
 * Adding it to Date.now() gives server time, so every timer in the room
 * agrees even when a participant's computer clock is wrong.
 */
export function clockOffset(serverTime: string, receivedAtMs: number): number {
  const server = Date.parse(serverTime);
  return Number.isNaN(server) ? 0 : server - receivedAtMs;
}
