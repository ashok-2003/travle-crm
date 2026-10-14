// The api refuses to start with settings that are missing, malformed or unsafe in production, and says which.
import { describe, expect, it } from "vitest";
import { authSettingsFrom, EnvironmentError, loadEnvironment } from "../src/environment.js";

const valid = {
  DATABASE_URL: "postgresql://app_runtime:runtime@localhost:55432/travel_crm",
  BETTER_AUTH_SECRET: "a-long-enough-development-secret-123",
  BETTER_AUTH_URL: "http://localhost:3001",
};

describe("environment", () => {
  it("fills in development defaults", () => {
    const environment = loadEnvironment({ ...valid, NODE_ENV: "development" });
    expect(environment).toMatchObject({ NODE_ENV: "development", PORT: 3001, AUTH_RATE_LIMIT: true });
    expect(authSettingsFrom(environment)).toMatchObject({
      secureCookies: false,
      trustedOrigins: [],
      rateLimit: true,
      ipAddressHeaders: ["x-forwarded-for"],
      trustedProxies: [],
    });
  });

  it("treats an unset NODE_ENV as production, so a deploy that forgets it gets the production guards", () => {
    expect(() => loadEnvironment(valid)).toThrow(/BETTER_AUTH_URL: must be https in production/);
    expect(loadEnvironment({ ...valid, BETTER_AUTH_URL: "https://app.example.in" }).NODE_ENV).toBe("production");
  });

  it("allows rate limiting off only in development and test", () => {
    for (const NODE_ENV of ["development", "test"]) {
      expect(loadEnvironment({ ...valid, NODE_ENV, AUTH_RATE_LIMIT: "false" }).AUTH_RATE_LIMIT).toBe(false);
    }
  });

  it("refuses weak secrets in production, naming the variable and never the value", () => {
    const production = { ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://app.example.in" };
    const weak = [
      "dev-only-secret-not-for-any-real-deploy",
      "ab".repeat(20),
      `   ${"x".repeat(20)}${"y".repeat(10)}   `,
    ];
    for (const BETTER_AUTH_SECRET of weak) {
      const attempt = () => loadEnvironment({ ...production, BETTER_AUTH_SECRET });
      expect(attempt).toThrow(/BETTER_AUTH_SECRET/);
      expect(attempt).not.toThrow(BETTER_AUTH_SECRET.trim());
    }
    expect(() =>
      loadEnvironment({ ...production, BETTER_AUTH_SECRET: "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug" }),
    ).not.toThrow();
    // Development may keep the example secret.
    expect(() =>
      loadEnvironment({
        ...valid,
        NODE_ENV: "development",
        BETTER_AUTH_SECRET: "dev-only-secret-not-for-any-real-deploy",
      }),
    ).not.toThrow();
  });

  it("accepts only plain origins in TRUSTED_ORIGINS, and only https ones in production", () => {
    const bad = ["https://*.example.in", "https://app.example.in/path", "https://a.example?x=1", "ftp://a.example"];
    for (const TRUSTED_ORIGINS of bad) {
      expect(() => loadEnvironment({ ...valid, NODE_ENV: "development", TRUSTED_ORIGINS })).toThrow(/TRUSTED_ORIGINS/);
    }
    const production = { ...valid, NODE_ENV: "production", BETTER_AUTH_URL: "https://app.example.in" };
    expect(() =>
      loadEnvironment({
        ...production,
        BETTER_AUTH_SECRET: "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug",
        TRUSTED_ORIGINS: "http://staging.example.in",
      }),
    ).toThrow(/TRUSTED_ORIGINS/);
  });

  it("reads AUTH_TRUSTED_PROXIES as a list of IP addresses and CIDR ranges", () => {
    const settings = authSettingsFrom(
      loadEnvironment({
        ...valid,
        NODE_ENV: "development",
        AUTH_TRUSTED_PROXIES: "10.0.0.0/8, 203.0.113.9 ,2001:db8::/32",
      }),
    );
    expect(settings.trustedProxies).toEqual(["10.0.0.0/8", "203.0.113.9", "2001:db8::/32"]);
    for (const AUTH_TRUSTED_PROXIES of ["example.com", "10.0.0.0/33", "10.0.0.0/", "300.1.1.1"]) {
      expect(() => loadEnvironment({ ...valid, NODE_ENV: "development", AUTH_TRUSTED_PROXIES })).toThrow(
        /AUTH_TRUSTED_PROXIES/,
      );
    }
  });

  it("names every missing or malformed variable, without printing values", () => {
    const attempt = () =>
      loadEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: "mysql://x",
        BETTER_AUTH_SECRET: "short-secret",
        PORT: "eighty",
      });
    expect(attempt).toThrow(EnvironmentError);
    expect(attempt).toThrow(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET[\s\S]*BETTER_AUTH_URL/);
    expect(attempt).toThrow(/PORT/);
    expect(attempt).not.toThrow(/short-secret/);
  });

  it("reads trusted origins as a comma-separated list of origins", () => {
    const settings = authSettingsFrom(
      loadEnvironment({
        ...valid,
        NODE_ENV: "development",
        TRUSTED_ORIGINS: " http://localhost:3000/ , https://staging.example.in",
      }),
    );
    expect(settings.trustedOrigins).toEqual(["http://localhost:3000", "https://staging.example.in"]);
    expect(() => loadEnvironment({ ...valid, NODE_ENV: "development", TRUSTED_ORIGINS: "localhost:3000" })).toThrow(
      /TRUSTED_ORIGINS/,
    );
  });

  it("insists on HTTPS, secure cookies and rate limiting in production", () => {
    const production = { ...valid, NODE_ENV: "production" };
    expect(() => loadEnvironment(production)).toThrow(/BETTER_AUTH_URL: must be https in production/);
    const https = {
      ...production,
      BETTER_AUTH_URL: "https://app.example.in",
      BETTER_AUTH_SECRET: "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug",
    };
    expect(authSettingsFrom(loadEnvironment(https)).secureCookies).toBe(true);
    expect(() => loadEnvironment({ ...https, AUTH_RATE_LIMIT: "false" })).toThrow(/AUTH_RATE_LIMIT/);
  });
});
