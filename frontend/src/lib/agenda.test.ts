import { describe, expect, it } from "vitest";

import {
  actualMinutes,
  agendaProgress,
  clockOffset,
  formatCountdown,
  itemTiming,
  totalMinutes,
} from "./agenda";
import type { AgendaItem } from "./types";

const START = Date.parse("2026-01-01T10:00:00Z");
const at = (seconds: number) => new Date(START + seconds * 1000).toISOString();

function item(position: number, minutes: number, started?: number, ended?: number): AgendaItem {
  return {
    id: position + 1,
    position,
    title: `Topic ${position}`,
    duration_minutes: minutes,
    started_at: started === undefined ? null : at(started),
    ended_at: ended === undefined ? null : at(ended),
  };
}

describe("agendaProgress", () => {
  it("knows an empty agenda", () => {
    expect(agendaProgress([])).toEqual({ phase: "empty" });
  });

  it("is not started until the first Next", () => {
    expect(agendaProgress([item(0, 5), item(1, 5)]).phase).toBe("not-started");
  });

  it("finds the running item and whether it is the last", () => {
    const progress = agendaProgress([item(0, 5, 0, 300), item(1, 5, 300)]);
    expect(progress).toMatchObject({ phase: "running", index: 1, isLast: true });
  });

  it("is finished when every item has ended", () => {
    expect(agendaProgress([item(0, 5, 0, 300), item(1, 5, 300, 600)]).phase).toBe("finished");
  });
});

describe("itemTiming", () => {
  it("counts down from the item's minutes", () => {
    const timing = itemTiming(item(0, 5, 0), START + 65_000);
    expect(timing).toEqual({ elapsedSeconds: 65, remainingSeconds: 235, tone: "ok" });
  });

  it("warns in the last minute", () => {
    expect(itemTiming(item(0, 5, 0), START + 241_000).tone).toBe("warn");
  });

  it("warns in the last quarter of a short item", () => {
    expect(itemTiming(item(0, 1, 0), START + 44_000).tone).toBe("ok");
    expect(itemTiming(item(0, 1, 0), START + 46_000).tone).toBe("warn");
  });

  it("goes negative and says over when the item runs long", () => {
    const timing = itemTiming(item(0, 1, 0), START + 90_000);
    expect(timing.remainingSeconds).toBe(-30);
    expect(timing.tone).toBe("over");
  });

  it("stops counting once the item has ended", () => {
    expect(itemTiming(item(0, 5, 0, 120), START + 999_000).elapsedSeconds).toBe(120);
  });

  it("never shows negative elapsed time if the clock is behind", () => {
    expect(itemTiming(item(0, 5, 10), START).elapsedSeconds).toBe(0);
  });
});

describe("formatCountdown", () => {
  it.each([
    [245, "4:05"],
    [9, "0:09"],
    [0, "0:00"],
    [-90, "-1:30"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatCountdown(seconds)).toBe(expected);
  });
});

describe("totals", () => {
  it("adds the planned minutes", () => {
    expect(totalMinutes([item(0, 5), item(1, 10)])).toBe(15);
  });

  it("rounds the actual minutes of a finished item", () => {
    expect(actualMinutes(item(0, 5, 0, 330))).toBe(6);
    expect(actualMinutes(item(0, 5, 0))).toBeNull();
  });
});

describe("clockOffset", () => {
  it("is how far the server clock is ahead", () => {
    expect(clockOffset("2026-01-01T10:00:05Z", START)).toBe(5000);
  });

  it("is zero for a value it cannot read", () => {
    expect(clockOffset("not a date", START)).toBe(0);
  });
});
