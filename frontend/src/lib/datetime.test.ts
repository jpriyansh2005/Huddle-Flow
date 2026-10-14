import { describe, expect, it } from "vitest";

import {
  formatDayLabel,
  formatDuration,
  formatElapsed,
  formatTimeRange,
  fromDateAndTimeInputs,
  greeting,
  minutesBetween,
  nextHalfHour,
  toDateInputValue,
  toTimeInputValue,
} from "./datetime";

// Dates are built from local-time parts, so these tests pass in any timezone.
const NOW = new Date(2026, 9, 9, 14, 20); // Fri 9 Oct 2026, 2:20 PM

describe("formatDayLabel", () => {
  it("names today, tomorrow and yesterday", () => {
    expect(formatDayLabel(new Date(2026, 9, 9, 23, 59), NOW)).toBe("Today");
    expect(formatDayLabel(new Date(2026, 9, 10, 0, 1), NOW)).toBe("Tomorrow");
    expect(formatDayLabel(new Date(2026, 9, 8, 9, 0), NOW)).toBe("Yesterday");
  });

  it("shows the weekday and date for other days", () => {
    expect(formatDayLabel(new Date(2026, 9, 12, 9, 0), NOW)).toBe("Mon, Oct 12");
  });
});

describe("formatTimeRange", () => {
  it("adds the duration to the start time", () => {
    expect(formatTimeRange(new Date(2026, 9, 9, 10, 0), 45)).toBe("10:00 AM - 10:45 AM");
  });

  it("crosses noon correctly", () => {
    expect(formatTimeRange(new Date(2026, 9, 9, 11, 30), 60)).toBe("11:30 AM - 12:30 PM");
  });
});

describe("formatDuration", () => {
  it.each([
    [15, "15 min"],
    [60, "1 hr"],
    [90, "1 hr 30 min"],
    [0, "0 min"],
  ])("formats %i minutes as %s", (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe("formatElapsed", () => {
  it.each([
    [5, "00:05"],
    [75, "01:15"],
    [3725, "1:02:05"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatElapsed(seconds)).toBe(expected);
  });
});

describe("minutesBetween", () => {
  it("rounds to whole minutes and never returns less than one", () => {
    const start = new Date(2026, 9, 9, 10, 0, 0);
    expect(minutesBetween(start, new Date(2026, 9, 9, 10, 55, 20))).toBe(55);
    expect(minutesBetween(start, new Date(2026, 9, 9, 10, 0, 5))).toBe(1);
  });
});

describe("date and time inputs", () => {
  it("round-trips a local date and time through the form values", () => {
    const original = new Date(2026, 0, 5, 9, 5);
    expect(toDateInputValue(original)).toBe("2026-01-05");
    expect(toTimeInputValue(original)).toBe("09:05");
    expect(fromDateAndTimeInputs("2026-01-05", "09:05").getTime()).toBe(original.getTime());
  });
});

describe("nextHalfHour", () => {
  it("moves forward to the next :00 or :30", () => {
    expect(toTimeInputValue(nextHalfHour(new Date(2026, 9, 9, 14, 20)))).toBe("14:30");
    expect(toTimeInputValue(nextHalfHour(new Date(2026, 9, 9, 14, 45)))).toBe("15:00");
  });

  it("moves a time already on the half hour to the following one", () => {
    expect(toTimeInputValue(nextHalfHour(new Date(2026, 9, 9, 14, 30)))).toBe("15:00");
  });
});

describe("greeting", () => {
  it("changes at noon and at 6 PM", () => {
    expect(greeting(new Date(2026, 9, 9, 0, 0))).toBe("Good morning");
    expect(greeting(new Date(2026, 9, 9, 11, 59))).toBe("Good morning");
    expect(greeting(new Date(2026, 9, 9, 12, 0))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 9, 9, 17, 59))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 9, 9, 18, 0))).toBe("Good evening");
  });
});
