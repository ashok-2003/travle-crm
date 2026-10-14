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
    const environment = loadEnvironment(valid);
    expect(environment).toMatchObject({ NODE_ENV: "development", PORT: 3001, AUTH_RATE_LIMIT: true });
    expect(authSettingsFrom(environment)).toMatchObject({
      secureCookies: false,
      trustedOrigins: [],
      rateLimit: true,
      ipAddressHeaders: ["x-forwarded-for"],
    });
  });

  it("names every missing or malformed variable, without printing values", () => {
    const attempt = () =>
      loadEnvironment({ DATABASE_URL: "mysql://x", BETTER_AUTH_SECRET: "short-secret", PORT: "eighty" });
    expect(attempt).toThrow(EnvironmentError);
    expect(attempt).toThrow(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET[\s\S]*BETTER_AUTH_URL/);
    expect(attempt).toThrow(/PORT/);
    expect(attempt).not.toThrow(/short-secret/);
  });

  it("reads trusted origins as a comma-separated list of origins", () => {
    const settings = authSettingsFrom(
      loadEnvironment({ ...valid, TRUSTED_ORIGINS: " http://localhost:3000/ , https://staging.example.in" }),
    );
    expect(settings.trustedOrigins).toEqual(["http://localhost:3000", "https://staging.example.in"]);
    expect(() => loadEnvironment({ ...valid, TRUSTED_ORIGINS: "localhost:3000" })).toThrow(/TRUSTED_ORIGINS/);
  });

  it("insists on HTTPS, secure cookies and rate limiting in production", () => {
    const production = { ...valid, NODE_ENV: "production" };
    expect(() => loadEnvironment(production)).toThrow(/BETTER_AUTH_URL: must be https in production/);
    const https = { ...production, BETTER_AUTH_URL: "https://app.example.in" };
    expect(authSettingsFrom(loadEnvironment(https)).secureCookies).toBe(true);
    expect(() => loadEnvironment({ ...https, AUTH_RATE_LIMIT: "false" })).toThrow(/AUTH_RATE_LIMIT/);
  });
});
