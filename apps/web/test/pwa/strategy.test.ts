// How the service worker answers each request (spec 11: an offline shell; cached data lives in the query cache, not
// here). It never answers for the api, in any case, so no organization data passes through the worker's caches, nor
// for the api's public routes: share links and webhooks.
import { describe, expect, it } from "vitest";
import { CACHE_NAMES, CACHE_PREFIXES, cachesToDelete, strategyFor } from "@/service-worker/strategy";

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

  it("treats /api without regard to case, as Next.js's rewrite sends /API/... to the api too", () => {
    for (const path of ["/API/trpc/me.get", "/Api/trpc/staff.list", "/aPi/auth/get-session", "/api", "/API"]) {
      expect(strategyFor(request(path, { mode: "navigate" }), origin), path).toBe("network-only");
      expect(strategyFor(request(path), origin), path).toBe("network-only");
    }
    // Only /api itself: a page whose path merely starts with the same letters is a page.
    expect(strategyFor(request("/apiary", { mode: "navigate" }), origin)).toBe("page");
  });

  it("leaves share links and webhooks to the network, in any case: a share link redirects to storage", () => {
    for (const path of ["/p/abc123", "/P/abc123", "/p", "/webhooks/razorpay", "/Webhooks/razorpay"]) {
      expect(strategyFor(request(path, { mode: "navigate" }), origin), path).toBe("network-only");
      expect(strategyFor(request(path), origin), path).toBe("network-only");
    }
    // Only those paths themselves: a page whose path merely starts with the same letters is a page.
    expect(strategyFor(request("/pricing", { mode: "navigate" }), origin)).toBe("page");
    expect(strategyFor(request("/webhooksettings", { mode: "navigate" }), origin)).toBe("page");
  });

  it("leaves the visitor's form pages and script to the network and never keeps them as pages", () => {
    for (const path of ["/f/abc", "/F/abc", "/embed/abc", "/EMBED/abc", "/embed.js"]) {
      expect(strategyFor(request(path, { mode: "navigate" }), origin), path).toBe("network-only");
      expect(strategyFor(request(path), origin), path).toBe("network-only");
    }
    // Only those paths themselves: a page whose path merely starts with the same letters is a page.
    expect(strategyFor(request("/fx", { mode: "navigate" }), origin)).toBe("page");
    expect(strategyFor(request("/embedded", { mode: "navigate" }), origin)).toBe("page");
  });

  it("answers page loads from the network first, falling back to a saved shell", () => {
    expect(strategyFor(request("/", { mode: "navigate" }), origin)).toBe("page");
    expect(strategyFor(request("/staff", { mode: "navigate" }), origin)).toBe("page");
  });

  it("serves the build's files from the cache, as their names change when their content does", () => {
    expect(strategyFor(request("/_next/static/chunks/0a1b2c.js"), origin)).toBe("cache-first");
    expect(strategyFor(request("/_next/static/media/figtree.woff2"), origin)).toBe("cache-first");
  });

  it("asks the network first for the icons, whose names stay the same when they change", () => {
    expect(strategyFor(request("/icons/icon-192.png"), origin)).toBe("network-first");
    expect(strategyFor(request("/icons/favicon.svg"), origin)).toBe("network-first");
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
    expect(cachesToDelete(["pages-v1", CACHE_NAMES.pages, CACHE_NAMES.static, "static-v1"])).toEqual([
      "pages-v1",
      "static-v1",
    ]);
  });

  it("never touches a cache it didn't make", () => {
    expect(cachesToDelete(["uploads", "drafts-v1", CACHE_NAMES.pages])).toEqual([]);
  });

  it("names its caches with its own prefixes, the only caches it ever deletes", () => {
    expect(CACHE_NAMES.pages.startsWith(CACHE_PREFIXES.pages)).toBe(true);
    expect(CACHE_NAMES.static.startsWith(CACHE_PREFIXES.static)).toBe(true);
  });
});
