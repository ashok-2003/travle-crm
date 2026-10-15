// Every page is sent with the strict headers spec 12.4 asks for, and the policy allows only our own origin. The pages
// whose address can hold a secret send no Referer at all.
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaderRules, securityHeaders } from "../security-headers";

/** The headers a page gets, applying the rules as Next.js does: in order, a later rule's value winning. */
function headersFor(path: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rule of securityHeaderRules({ development: false })) {
    if (rule.source === "/:path*" || rule.source === path) {
      for (const { key, value } of rule.headers) headers[key] = value;
    }
  }
  return headers;
}

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

  it("let only development evaluate code", () => {
    expect(contentSecurityPolicy({ development: false })).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy({ development: true })).toContain("'unsafe-eval'");
  });

  it("upgrade any plain-http request a deployed page makes", () => {
    expect(contentSecurityPolicy({ development: false })).toContain("upgrade-insecure-requests");
    // Development may run on a phone over the local network, without https.
    expect(contentSecurityPolicy({ development: true })).not.toContain("upgrade-insecure-requests");
  });

  it("send no referrer from the reset and two-factor pages, whose address can hold a token", () => {
    for (const page of ["/reset-password", "/sign-in/two-factor", "/two-factor-setup"]) {
      expect(headersFor(page)["Referrer-Policy"], page).toBe("no-referrer");
      expect(headersFor(page)["Content-Security-Policy"], page).toContain("default-src 'self'");
    }
    expect(headersFor("/staff")["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
