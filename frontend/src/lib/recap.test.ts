import { describe, expect, it } from "vitest";

import { agendaReview, formatPresence, recapPath, topicOutcome } from "./recap";
import type { AgendaItem } from "./types";

const START = Date.parse("2026-01-01T10:00:00Z");
const at = (minutes: number) => new Date(START + minutes * 60_000).toISOString();

function topic(planned: number, started?: number, ended?: number): AgendaItem {
  return {
    id: 1,
    position: 0,
    title: "Topic",
    duration_minutes: planned,
    started_at: started === undefined ? null : at(started),
    ended_at: ended === undefined ? null : at(ended),
  };
}

describe("recapPath", () => {
  it("links to the recap, with the key when there is one", () => {
    expect(recapPath("12345678901")).toBe("/recap/12345678901");
    expect(recapPath("12345678901", null)).toBe("/recap/12345678901");
    expect(recapPath("12345678901", "a-B_c")).toBe("/recap/12345678901?key=a-B_c");
  });

  it("escapes characters that would break the query string", () => {
    expect(recapPath("1", "a&b=c")).toBe("/recap/1?key=a%26b%3Dc");
  });
});

describe("formatPresence", () => {
  it("rounds to minutes, and says so below one", () => {
    expect(formatPresence(0)).toBe("Under a minute");
    expect(formatPresence(59)).toBe("Under a minute");
    expect(formatPresence(60)).toBe("1 min");
    expect(formatPresence(89)).toBe("1 min");
    expect(formatPresence(90)).toBe("2 min");
    expect(formatPresence(3900)).toBe("1 hr 5 min");
  });
});

describe("topicOutcome", () => {
  it("knows topics that were never reached or are still running", () => {
    expect(topicOutcome(topic(10))).toEqual({ kind: "skipped" });
    expect(topicOutcome(topic(10, 0))).toEqual({ kind: "running" });
  });

  it("calls a minute either way on time", () => {
    expect(topicOutcome(topic(10, 0, 11))).toEqual({ kind: "on-time", actual: 11 });
    expect(topicOutcome(topic(10, 0, 9))).toEqual({ kind: "on-time", actual: 9 });
  });

  it("says how far over or under the plan a topic went", () => {
    expect(topicOutcome(topic(10, 0, 15))).toEqual({ kind: "over", actual: 15, difference: 5 });
    expect(topicOutcome(topic(10, 0, 4))).toEqual({ kind: "under", actual: 4, difference: 6 });
  });
});

describe("agendaReview", () => {
  it("adds up plans, real time and how many topics were covered", () => {
    expect(agendaReview([topic(10, 0, 12), topic(5, 12, 15), topic(20)])).toEqual({
      covered: 2,
      total: 3,
      planned: 35,
      actual: 15,
    });
  });

  it("is all zero for no agenda", () => {
    expect(agendaReview([])).toEqual({ covered: 0, total: 0, planned: 0, actual: 0 });
  });
});
