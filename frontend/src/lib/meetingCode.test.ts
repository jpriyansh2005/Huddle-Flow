import { describe, expect, it } from "vitest";

import { formatMeetingCode, parseMeetingInput } from "./meetingCode";

describe("formatMeetingCode", () => {
  it("groups an 11-digit ID as 3-4-4", () => {
    expect(formatMeetingCode("86412345678")).toBe("864 1234 5678");
  });

  it("leaves anything that is not 11 digits unchanged", () => {
    expect(formatMeetingCode("12345")).toBe("12345");
  });
});

describe("parseMeetingInput", () => {
  it.each([
    ["86412345678", "a plain ID"],
    ["864 1234 5678", "an ID with spaces"],
    ["864-1234-5678", "an ID with dashes"],
    ["  86412345678 ", "an ID with surrounding spaces"],
    ["http://localhost:3000/j/86412345678", "an invite link"],
    ["https://huddleflow.vercel.app/j/86412345678?from=email", "an invite link with a query"],
  ])("reads the ID from %s (%s)", (input) => {
    expect(parseMeetingInput(input)).toBe("86412345678");
  });

  it.each(["", "hello", "1234", "123456789012", "864 1234 567x"])("rejects %j", (input) => {
    expect(parseMeetingInput(input)).toBeNull();
  });
});
