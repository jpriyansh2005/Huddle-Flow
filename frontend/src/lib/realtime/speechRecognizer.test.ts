import { describe, expect, it } from "vitest";

import {
  cleanCaption,
  MAX_CAPTION_LENGTH,
  readResults,
  RestartBudget,
  type SpeechResultEvent,
} from "./speechRecognizer";

function event(resultIndex: number, results: Array<[string, boolean]>): SpeechResultEvent {
  return {
    resultIndex,
    results: Object.assign(
      results.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })),
      { length: results.length },
    ),
  };
}

describe("cleanCaption", () => {
  it("trims and collapses spaces", () => {
    expect(cleanCaption("  ship   on\nFriday ")).toBe("ship on Friday");
  });

  it("keeps the end of text that is too long", () => {
    const long = "a".repeat(10) + " " + "b".repeat(MAX_CAPTION_LENGTH);
    const clean = cleanCaption(long);
    expect(clean.length).toBeLessThanOrEqual(MAX_CAPTION_LENGTH);
    expect(clean.endsWith("b")).toBe(true);
  });
});

describe("readResults", () => {
  it("separates finished sentences from the one still being spoken", () => {
    const result = readResults(
      event(0, [
        [" We ship on Friday", true],
        [" and then", false],
        [" we rest", false],
      ]),
    );
    expect(result).toEqual({ finals: ["We ship on Friday"], interim: "and then we rest" });
  });

  it("ignores results that were already handled", () => {
    const result = readResults(
      event(1, [
        ["Old sentence", true],
        ["New sentence", true],
      ]),
    );
    expect(result.finals).toEqual(["New sentence"]);
  });

  it("drops empty sentences", () => {
    expect(readResults(event(0, [["   ", true]]))).toEqual({ finals: [], interim: "" });
  });
});

describe("RestartBudget", () => {
  it("allows a few restarts, then refuses until time has passed", () => {
    const budget = new RestartBudget(2, 1000);
    expect(budget.allow(0)).toBe(true);
    expect(budget.allow(100)).toBe(true);
    expect(budget.allow(200)).toBe(false);
    expect(budget.allow(1050)).toBe(true);
  });
});
