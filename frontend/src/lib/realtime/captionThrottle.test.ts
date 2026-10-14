import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaptionThrottle } from "./captionThrottle";

describe("CaptionThrottle", () => {
  let sent: Array<[string, boolean]>;
  let throttle: CaptionThrottle;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    throttle = new CaptionThrottle(
      (text, final) => sent.push([text, final]),
      300,
      () => Date.now(),
    );
  });

  afterEach(() => {
    throttle.cancel();
    vi.useRealTimers();
  });

  it("sends the first guess at once, then at most one per interval, always the latest", () => {
    throttle.push("we", false);
    throttle.push("we ship", false);
    throttle.push("we ship on", false);
    expect(sent).toEqual([["we", false]]);

    vi.advanceTimersByTime(300);
    expect(sent).toEqual([
      ["we", false],
      ["we ship on", false],
    ]);
  });

  it("does not repeat the same guess", () => {
    throttle.push("hello", false);
    vi.advanceTimersByTime(1000);
    throttle.push("hello", false);
    expect(sent).toEqual([["hello", false]]);
  });

  it("sends a finished sentence at once and drops the guess still waiting", () => {
    throttle.push("we", false);
    throttle.push("we ship", false);
    throttle.push("We ship on Friday", true);
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([
      ["we", false],
      ["We ship on Friday", true],
    ]);
  });

  it("forgets a waiting guess when cancelled", () => {
    throttle.push("one", false);
    throttle.push("one two", false);
    throttle.cancel();
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([["one", false]]);
  });
});
