// Every page is sent with the strict headers spec 12.4 asks for, and the policy allows only our own origin. The pages
// whose address can hold a secret send only their origin as Referer, never the path or query. What the app hands on to
// the api keeps the api's own headers.
import { buildCustomRoute } from "next/dist/lib/build-custom-route";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaderRules, securityHeaders } from "../security-headers";

/**
 * The headers a path gets, applying the rules as Next.js does: each rule's source made into the regex the build writes
 * to its routes manifest (which Vercel serves from too), in order, a later value winning.
 */
function headersFor(path: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rule of securityHeaderRules({ development: false })) {
    if (new RegExp(buildCustomRoute("header", rule).regex).test(path)) {
      for (const { key, value } of rule.headers) headers[key] = value;
    }
  }
  return headers;
}

/** A header's value, whatever its case; undefined when the response has no such header. */
function headerOf(headers: Record<string, string>, name: string): string | undefined {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

/** The policy as directive -> sources. */
function directives(policy: string | undefined): Record<string, string[]> {
  return Object.fromEntries(
    (policy ?? "").split("; ").map((directive) => {
      const [name = "", ...sources] = directive.split(" ");
      return [name, sources];
    }),
  );
}

const TURNSTILE = "https://challenges.cloudflare.com";

describe("security headers", () => {
  it("refuse framing, sniffing and other origins", () => {
    const headers = Object.fromEntries(securityHeaders({ development: false }).map(({ key, value }) => [key, value]));
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
    const policy = headers["Content-Security-Policy"] ?? "";
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toMatch(/https?:|\*/);
  });

  it("let the browser reach the storage it uploads to and shows images from, and no other", () => {
    const policy = contentSecurityPolicy({ development: false, storageOrigin: "https://files.example.in" });
    expect(policy).toContain("connect-src 'self' https://files.example.in;");
    expect(policy).toContain("img-src 'self' data: blob: https://files.example.in;");
    expect(policy).toContain("default-src 'self';");
    expect(contentSecurityPolicy({ development: false })).toContain("connect-src 'self';");
  });

  it("let only development evaluate code", () => {
    expect(contentSecurityPolicy({ development: false })).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy({ development: true })).toContain("'unsafe-eval'");
  });

  it("upgrade any plain-http request a deployed page makes", () => {
    expect(contentSecurityPolicy({ development: false })).toContain("upgrade-insecure-requests");
    // Development may run on a phone over the local network, without https.
    expect(contentSecurityPolicy({ development: true })).not.toContain("upgrade-insecure-requests");
  });

  it("send only the origin as referrer from the reset and two-factor pages, whose address can hold a token", () => {
    for (const page of ["/reset-password", "/sign-in/two-factor", "/two-factor-setup"]) {
      // Not "no-referrer": that makes a same-origin POST send "Origin: null", which the api's origin checks refuse.
      expect(headersFor(page)["Referrer-Policy"], page).toBe("strict-origin");
      expect(headersFor(page)["Content-Security-Policy"], page).toContain("default-src 'self'");
    }
    expect(headersFor("/staff")["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("send only the origin from the offline page too, which the service worker shows at any address", () => {
    // Offline at /reset-password?token=..., the worker answers with the stored /offline page, headers and all.
    expect(headersFor("/offline")["Referrer-Policy"]).toBe("strict-origin");
  });

  it("go on every page, the home page and the service worker included", () => {
    for (const path of [
      "/",
      "/sign-in",
      "/leads/0192f2c4-0000-7000-8000-000000000000",
      "/pricing",
      "/apiary",
      "/sw.js",
    ]) {
      expect(headersFor(path)["Content-Security-Policy"], path).toContain("default-src 'self'");
    }
  });

  it("leave what the app hands on to the api with the api's own headers, as a load balancer does", () => {
    // Where the app itself rewrites /api, /p and /webhooks (Vercel, docs/serverless.md), its headers would otherwise
    // replace the api's: a share link's page would lose its no-referrer and its stricter policy.
    for (const path of ["/p/a-token", "/p", "/api/trpc/me.get", "/api/platform/trpc/whoAmI", "/webhooks/meta"]) {
      expect(headersFor(path), path).toEqual({});
    }
  });

  describe("the CSP rules for /f, /embed and /embed.js", () => {
    it("keep /f/x unframable and add Turnstile only to script, frame and connect", () => {
      const headers = headersFor("/f/AAAAAAAAAAAAAAAAAAAAAAbbbbbbbbbbbbbbbb");
      const policy = directives(headers["Content-Security-Policy"]);
      expect(headers["X-Frame-Options"]).toBe("DENY");
      expect(policy["frame-ancestors"]).toEqual(["'none'"]);
      expect(policy["script-src"]).toContain(TURNSTILE);
      expect(policy["frame-src"]).toEqual([TURNSTILE]);
      expect(policy["connect-src"]).toContain(TURNSTILE);
      for (const name of ["default-src", "img-src", "style-src", "font-src", "form-action"]) {
        expect(policy[name], name).not.toContain(TURNSTILE);
      }
    });

    it("let any https site frame /embed/x, with no X-Frame-Options anywhere in the response headers", () => {
      const headers = headersFor("/embed/AAAAAAAAAAAAAAAAAAAAAAbbbbbbbbbbbbbbbb");
      const policy = directives(headers["Content-Security-Policy"]);
      expect(headerOf(headers, "X-Frame-Options")).toBeUndefined();
      expect(policy["frame-ancestors"]).toEqual(["https:"]);
      expect(policy["script-src"]).toContain(TURNSTILE);
      expect(policy["frame-src"]).toEqual([TURNSTILE]);
      expect(policy["connect-src"]).toContain(TURNSTILE);
      expect(headers["Referrer-Policy"]).toBe("strict-origin");
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(headers["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
    });

    it("do not let http: frame the embed", () => {
      const sources = directives(headersFor("/embed/x")["Content-Security-Policy"])["frame-ancestors"] ?? [];
      expect(sources).not.toContain("http:");
      expect(sources.join(" ")).not.toMatch(/\*/);
    });

    it("stop the catch-all matching /embed, but not a page that merely starts with the same letters", () => {
      expect(headerOf(headersFor("/embed"), "X-Frame-Options")).toBeUndefined();
      expect(headersFor("/embedded")["X-Frame-Options"]).toBe("DENY");
      expect(headersFor("/fx")["X-Frame-Options"]).toBe("DENY");
    });

    it("mention Turnstile on no other route", () => {
      for (const path of [
        "/",
        "/sign-in",
        "/leads/x",
        "/reset-password",
        "/offline",
        "/fx",
        "/embedded",
        "/sw.js",
        "/embed.js",
      ]) {
        const everything = Object.values(headersFor(path)).join("\n");
        expect(everything, path).not.toContain("challenges.cloudflare.com");
      }
    });

    it("cache /embed.js for an hour", () => {
      expect(headersFor("/embed.js")["Cache-Control"]).toBe("public, max-age=3600");
      expect(headersFor("/embed.js")["X-Content-Type-Options"]).toBe("nosniff");
    });
  });
});
