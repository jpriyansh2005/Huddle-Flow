import { describe, expect, it } from "vitest";

import { isValidEmail, safeNextPath, signInPath } from "./auth";

describe("safeNextPath", () => {
  it.each(["/", "/meetings", "/meetings?tab=previous", "/recap/86412345678"])("keeps %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    [null, "nothing"],
    ["", "an empty value"],
    ["https://evil.example", "another site"],
    ["//evil.example/x", "a protocol-relative address"],
    ["/\\evil.example", "a backslash trick"],
    ["meetings", "a relative path"],
    ["/login", "the sign-in page itself"],
    ["/signup?next=/meetings", "the sign-up page"],
  ])("falls back to / for %s (%s)", (path, reason) => {
    expect(safeNextPath(path), reason).toBe("/");
  });
});

describe("signInPath", () => {
  it("remembers where to come back to", () => {
    expect(signInPath("/meetings?tab=previous")).toBe("/login?next=%2Fmeetings%3Ftab%3Dprevious");
  });

  it("needs no next value for the home page", () => {
    expect(signInPath("/")).toBe("/login");
  });
});

describe("isValidEmail", () => {
  it.each(["ana@example.com", " ana@example.co.uk ", "a.b+c@x.io"])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(["", "ana", "ana@", "ana@example", "two@@example.com", "a b@x.io"])("rejects %j", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});
