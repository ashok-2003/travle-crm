// After signing in, a person returns to the page they were sent from, but never to another site.
import { describe, expect, it } from "vitest";
import { nextPath } from "@/account/next-path";

describe("nextPath", () => {
  it("returns an app path from ?next=, and home otherwise", () => {
    expect(nextPath(new URLSearchParams("next=/staff"))).toBe("/staff");
    expect(nextPath(new URLSearchParams())).toBe("/");
    expect(nextPath(new URLSearchParams("next=//evil.example"))).toBe("/");
    expect(nextPath(new URLSearchParams("next=https://evil.example"))).toBe("/");
  });
});
