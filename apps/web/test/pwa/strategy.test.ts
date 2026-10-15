// How the service worker answers each request (spec 11: an offline shell; cached data lives in the query cache, not
// here). It never touches the api, so no organization data is ever stored by the worker.
import { describe, expect, it } from "vitest";
import { CACHE_NAMES, cachesToDelete, OFFLINE_PAGE, strategyFor } from "@/service-worker/strategy";

const origin = "https://app.example.in";
const request = (path: string, { method = "GET", mode = "cors" }: { method?: string; mode?: string } = {}) => ({
  url: `${origin}${path}`,
  method,
  mode,
});

describe("strategyFor", () => {
  it("leaves every api call to the network, page loads of api links included", () => {
    expect(strategyFor(request("/api/trpc/staff.list?batch=1"), origin)).toBe("network-only");
    expect(strategyFor(request("/api/trpc/staff.create", { method: "POST" }), origin)).toBe("network-only");
    // The password-reset link in an email opens /api/auth/reset-password/<token>, which redirects to the app.
    expect(strategyFor(request("/api/auth/reset-password/abc", { mode: "navigate" }), origin)).toBe("network-only");
  });

  it("answers page loads from the network first, falling back to a saved copy", () => {
    expect(strategyFor(request("/", { mode: "navigate" }), origin)).toBe("page");
    expect(strategyFor(request("/staff", { mode: "navigate" }), origin)).toBe("page");
  });

  it("serves the build's files and the icons from the cache, as their names change when their content does", () => {
    expect(strategyFor(request("/_next/static/chunks/0a1b2c.js"), origin)).toBe("cache-first");
    expect(strategyFor(request("/_next/static/media/figtree.woff2"), origin)).toBe("cache-first");
    expect(strategyFor(request("/icons/icon-192.png"), origin)).toBe("cache-first");
  });

  it("leaves everything else alone: other methods and sites, the worker itself, data the router fetches", () => {
    expect(strategyFor(request("/staff", { method: "POST", mode: "navigate" }), origin)).toBe("network-only");
    expect(strategyFor({ url: "https://fonts.example/x.css", method: "GET", mode: "cors" }, origin)).toBe(
      "network-only",
    );
    expect(strategyFor(request("/sw.js"), origin)).toBe("network-only");
    expect(strategyFor(request("/staff?_rsc=1x2y"), origin)).toBe("network-only");
    expect(strategyFor(request("/manifest.webmanifest"), origin)).toBe("network-only");
  });
});

describe("cachesToDelete", () => {
  it("drops caches an older worker made and keeps the current ones", () => {
    expect(cachesToDelete(["pages-v0", CACHE_NAMES.pages, CACHE_NAMES.static, "static-v0"])).toEqual([
      "pages-v0",
      "static-v0",
    ]);
  });
});

describe("OFFLINE_PAGE", () => {
  it("is a page of the app", () => {
    expect(OFFLINE_PAGE).toBe("/offline");
  });
});
