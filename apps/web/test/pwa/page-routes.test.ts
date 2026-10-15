// @vitest-environment node
// The service worker learns the app's pages when it is bundled, from the page files under src/app, so a new screen
// is kept for offline use without anyone listing it. (Node: the bundler can't load in a simulated browser.)
import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { pageRoutes } from "../../scripts/service-worker";

describe("pageRoutes", () => {
  it("turns page files into addresses: route groups add nothing, dynamic segments stay", () => {
    const files = [
      "(app)/page.tsx",
      "(app)/staff/page.tsx",
      "(app)/roles/[key]/page.tsx",
      "(account)/sign-in/two-factor/page.tsx",
      "offline/page.tsx",
      "layout.tsx",
      "(app)/layout.tsx",
      "manifest.ts",
      "globals.css",
    ];
    expect(pageRoutes(files)).toEqual(["/", "/offline", "/roles/[key]", "/sign-in/two-factor", "/staff"]);
  });

  it("skips private folders, and a parallel route's slot adds nothing to the address", () => {
    expect(pageRoutes(["_parts/page.tsx", "(app)/@modal/staff/page.tsx"])).toEqual(["/staff"]);
  });

  it("reads Windows paths too", () => {
    expect(pageRoutes(["(app)\\staff\\page.tsx"])).toEqual(["/staff"]);
  });

  it("finds every screen of the app", async () => {
    const files = await readdir(new URL("../../src/app", import.meta.url), { recursive: true });
    expect(pageRoutes(files)).toEqual(
      expect.arrayContaining(["/", "/staff", "/roles", "/roles/[key]", "/settings", "/account", "/offline"]),
    );
  });
});
