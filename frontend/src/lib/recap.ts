/** Helpers for the meeting recap page. */

import { actualMinutes } from "./agenda";
import { formatDuration } from "./datetime";
import type { AgendaItem } from "./types";

/** Where a meeting's recap lives. With the key, it opens without an account. */
export function recapPath(code: string, key?: string | null): string {
  return key ? `/recap/${code}?key=${encodeURIComponent(key)}` : `/recap/${code}`;
}

/** Time someone spent in a meeting: 30 -> "Under a minute", 3900 -> "1 hr 5 min". */
export function formatPresence(seconds: number): string {
  if (seconds < 60) return "Under a minute";
  return formatDuration(Math.round(seconds / 60));
}

export type TopicOutcome =
  | { kind: "skipped" }
  | { kind: "running" }
  | { kind: "on-time"; actual: number }
  | { kind: "over" | "under"; actual: number; difference: number };

/**
 * How one agenda topic went against its plan. Within a minute either way
 * counts as on time, because actual minutes are rounded.
 */
export function topicOutcome(item: AgendaItem): TopicOutcome {
  if (!item.started_at) return { kind: "skipped" };
  const actual = actualMinutes(item);
  if (actual === null) return { kind: "running" };
  const difference = actual - item.duration_minutes;
  if (Math.abs(difference) <= 1) return { kind: "on-time", actual };
  return { kind: difference > 0 ? "over" : "under", actual, difference: Math.abs(difference) };
}

export type AgendaReview = {
  /** Topics that were started. */
  covered: number;
  total: number;
  /** Planned minutes of all topics. */
  planned: number;
  /** Real minutes of the topics that finished. */
  actual: number;
};

export function agendaReview(items: AgendaItem[]): AgendaReview {
  return items.reduce<AgendaReview>(
    (review, item) => ({
      covered: review.covered + (item.started_at ? 1 : 0),
      total: review.total + 1,
      planned: review.planned + item.duration_minutes,
      actual: review.actual + (actualMinutes(item) ?? 0),
    }),
    { covered: 0, total: 0, planned: 0, actual: 0 },
  );
}
