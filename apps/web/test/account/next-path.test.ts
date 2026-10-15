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

  it("refuses a path that a browser would resolve to another site", () => {
    // Browsers drop tabs and newlines from a URL and read "\" as "/", so each of these would leave the app.
    for (const next of [
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "/\\evil.example",
      "/%5Cevil.example",
    ]) {
      expect(nextPath(new URLSearchParams({ next }))).toBe("/");
    }
  });
});
