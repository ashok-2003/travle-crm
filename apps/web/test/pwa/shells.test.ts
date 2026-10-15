// What the service worker keeps for offline use: the shell of every static page, under its path alone, and the
// build's files those shells name. Never an api answer, a page marked for one person, or an address's query (a reset
// token travels in one).
import { describe, expect, it } from "vitest";
import {
  fileCacheKey,
  filesNamedIn,
  filesNamedInStylesheet,
  isKeepableFile,
  isKeepablePage,
  pageCacheKey,
  parentShellFor,
  shellsToKeep,
} from "@/service-worker/shells";
import { OFFLINE_PAGE } from "@/service-worker/strategy";

const appRoutes = [
  "/",
  "/account",
  "/offline",
  "/reset-password",
  "/roles",
  "/roles/[key]",
  "/settings",
  "/sign-in",
  "/sign-in/two-factor",
  "/staff",
  "/two-factor-setup",
];

describe("shellsToKeep", () => {
  it("keeps every static page, the offline page among them", () => {
    expect(shellsToKeep(appRoutes)).toEqual(
      expect.arrayContaining(["/", "/account", "/roles", "/settings", "/sign-in", "/staff", OFFLINE_PAGE]),
    );
  });

  it("never keeps a page that handles a secret, or one that renders per address", () => {
    const shells = shellsToKeep(appRoutes);
    for (const page of ["/reset-password", "/sign-in/two-factor", "/two-factor-setup", "/roles/[key]"]) {
      expect(shells).not.toContain(page);
    }
  });

  it("keeps the offline page even when the page list misses it", () => {
    expect(shellsToKeep(["/"])).toEqual(["/", OFFLINE_PAGE]);
  });
});

describe("pageCacheKey", () => {
  it("keys a page by its path alone, so no query or fragment, a reset token included, reaches Cache Storage", () => {
    expect(pageCacheKey("https://app.example.in/reset-password?token=abc#top")).toBe(
      "https://app.example.in/reset-password",
    );
    expect(pageCacheKey("https://app.example.in/sign-in?next=%2Fstaff")).toBe("https://app.example.in/sign-in");
  });
});

describe("fileCacheKey", () => {
  it("keys a file by its address, query kept (it can name a deployment), fragment dropped", () => {
    expect(fileCacheKey("https://app.example.in/_next/static/chunks/a.js?dpl=7#x")).toBe(
      "https://app.example.in/_next/static/chunks/a.js?dpl=7",
    );
  });
});

describe("isKeepablePage", () => {
  const staticPage = { "content-type": "text/html; charset=utf-8", "cache-control": "s-maxage=31536000" };
  const page = ({
    type = "basic",
    ok = true,
    redirected = false,
    headers = staticPage,
  }: { type?: string; ok?: boolean; redirected?: boolean; headers?: Record<string, string> } = {}) => ({
    type,
    ok,
    redirected,
    headers: new Headers(headers),
  });

  it("keeps the app's own static page", () => {
    expect(isKeepablePage(page())).toBe(true);
  });

  it("refuses an api answer, or anything but HTML", () => {
    expect(isKeepablePage(page({ headers: { "content-type": "application/json" } }))).toBe(false);
    expect(isKeepablePage(page({ headers: { "content-type": "text/x-component" } }))).toBe(false);
    expect(isKeepablePage(page({ headers: {} }))).toBe(false);
  });

  it("refuses a page marked for one person: Next.js marks a page rendered per request no-store", () => {
    const perRequest = { "content-type": "text/html", "cache-control": "private, no-cache, no-store, max-age=0" };
    expect(isKeepablePage(page({ headers: perRequest }))).toBe(false);
  });

  it("refuses a redirected answer, another site's, and a failure", () => {
    expect(isKeepablePage(page({ redirected: true }))).toBe(false);
    expect(isKeepablePage(page({ type: "opaque" }))).toBe(false);
    expect(isKeepablePage(page({ type: "cors" }))).toBe(false);
    expect(isKeepablePage(page({ ok: false }))).toBe(false);
  });

  it("refuses an answer that sets a cookie", () => {
    expect(isKeepablePage(page({ headers: { ...staticPage, "set-cookie": "session=1" } }))).toBe(false);
  });
});

describe("isKeepableFile", () => {
  it("keeps a whole file of the app's own, nothing else", () => {
    expect(isKeepableFile({ type: "basic", status: 200 })).toBe(true);
    expect(isKeepableFile({ type: "basic", status: 206 })).toBe(false);
    expect(isKeepableFile({ type: "basic", status: 404 })).toBe(false);
    expect(isKeepableFile({ type: "opaque", status: 0 })).toBe(false);
  });
});

describe("filesNamedIn", () => {
  it("lists the build's files and icons a shell names, those only in the router's data included", () => {
    const html = [
      '<link rel="preload" href="/_next/static/media/figtree.woff2" as="font" crossorigin=""/>',
      '<link rel="stylesheet" href="/_next/static/chunks/app.css" data-precedence="next"/>',
      '<script src="/_next/static/chunks/main.js" async=""></script>',
      '<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml"/>',
      '<script>self.__next_f.push([1,"3:I[123,[\\"/_next/static/chunks/staff.js\\"],\\"default\\"]"])</script>',
      '<script src="/_next/static/chunks/main.js" async=""></script>',
    ].join("");
    expect(filesNamedIn(html).sort()).toEqual([
      "/_next/static/chunks/app.css",
      "/_next/static/chunks/main.js",
      "/_next/static/chunks/staff.js",
      "/_next/static/media/figtree.woff2",
      "/icons/favicon.svg",
    ]);
  });

  it("skips legacy scripts, which a browser with service workers never runs", () => {
    expect(filesNamedIn('<script src="/_next/static/chunks/polyfills.js" noModule=""></script>')).toEqual([]);
  });
});

describe("filesNamedInStylesheet", () => {
  const stylesheet = "https://app.example.in/_next/static/chunks/app.css";

  it("lists the fonts a stylesheet names, its url()s read against the stylesheet's address", () => {
    const css = [
      '@font-face{src:url("../media/devanagari.woff2") format("woff2")}',
      "@font-face{src:url('../media/tamil.woff2')}",
      "@font-face{src:url(/_next/static/media/figtree.woff2)}",
      '@font-face{src:url("../media/devanagari.woff2")}',
    ].join("");
    expect(filesNamedInStylesheet(css, stylesheet)).toEqual([
      "https://app.example.in/_next/static/media/devanagari.woff2",
      "https://app.example.in/_next/static/media/tamil.woff2",
      "https://app.example.in/_next/static/media/figtree.woff2",
    ]);
  });

  it("skips inline data and other sites' files", () => {
    const css = "a{background:url(data:image/svg+xml;utf8,<svg/>)}@font-face{src:url(https://fonts.example/x.woff2)}";
    expect(filesNamedInStylesheet(css, stylesheet)).toEqual([]);
  });
});

describe("parentShellFor", () => {
  it("lets a page that renders per address, such as a role's, fall back to the screen above it", () => {
    expect(parentShellFor("/roles/sales", appRoutes)).toBe("/roles");
  });

  it("gives no fallback to an address of no page with a dynamic segment", () => {
    for (const path of ["/roles", "/roles/sales/extra", "/staff/sales", "/nowhere"]) {
      expect(parentShellFor(path, appRoutes), path).toBeNull();
    }
  });
});
