// Every page is sent with the strict headers spec 12.4 asks for, and the policy allows only our own origin.
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "../security-headers";

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
});
