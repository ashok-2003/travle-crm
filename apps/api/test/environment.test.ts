// The api refuses to start with settings that are missing, malformed or unsafe in production, and says which.
import { readFileSync } from "node:fs";
import path from "node:path";
import { brand } from "@travel-crm/brand";
import { describe, expect, it } from "vitest";
import { authSettingsFrom, EnvironmentError, loadEnvironment } from "../src/environment.js";

const valid = {
  DATABASE_URL: "postgresql://app_runtime:runtime@localhost:55432/travel_crm",
  BETTER_AUTH_SECRET: "a-long-enough-development-secret-123",
  BETTER_AUTH_URL: "http://localhost:3001",
  S3_BUCKET: "travel-crm",
  S3_ACCESS_KEY_ID: "minio-dev",
  S3_SECRET_ACCESS_KEY: "minio-dev-secret",
  SMTP_HOST: "localhost",
  EMAIL_FROM_ADDRESS: "no-reply@travel-crm.localhost",
  VAPID_PUBLIC_KEY: "public-key",
  VAPID_PRIVATE_KEY: "private-key",
  VAPID_SUBJECT: "mailto:dev@travel-crm.localhost",
};

describe("environment", () => {
  it("fills in development defaults", () => {
    const environment = loadEnvironment({ ...valid, NODE_ENV: "development" });
    expect(environment).toMatchObject({ NODE_ENV: "development", PORT: 3001, AUTH_RATE_LIMIT: true });
    expect(authSettingsFrom(environment)).toMatchObject({
      secureCookies: false,
      // The web app's development address (APP_URL's default).
      trustedOrigins: ["http://localhost:3000"],
      rateLimit: true,
      ipAddressHeaders: ["x-forwarded-for"],
      trustedProxies: [],
    });
  });

  it("sets the log level from LOG_LEVEL, or by environment: info in production, debug in development and tests", () => {
    const production = { ...valid, BETTER_AUTH_URL: "https://app.example.in", APP_URL: "https://app.example.in" };
    expect(loadEnvironment(production).LOG_LEVEL).toBe("info");
    expect(loadEnvironment({ ...valid, NODE_ENV: "development" }).LOG_LEVEL).toBe("debug");
    expect(loadEnvironment({ ...valid, NODE_ENV: "test" }).LOG_LEVEL).toBe("debug");
    expect(loadEnvironment({ ...production, LOG_LEVEL: "warn" }).LOG_LEVEL).toBe("warn");
    // A compose file's blank is the same as unset.
    expect(loadEnvironment({ ...production, LOG_LEVEL: "" }).LOG_LEVEL).toBe("info");
    expect(() => loadEnvironment({ ...production, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });

  it("takes Axiom's token and dataset together or not at all, over https outside development", () => {
    const production = { ...valid, BETTER_AUTH_URL: "https://app.example.in", APP_URL: "https://app.example.in" };
    expect(loadEnvironment(production).AXIOM_TOKEN).toBeUndefined();
    expect(loadEnvironment(production).AXIOM_DATASET).toBeUndefined();
    // A compose file's blanks are the same as unset.
    expect(loadEnvironment({ ...production, AXIOM_TOKEN: "", AXIOM_DATASET: "" }).AXIOM_TOKEN).toBeUndefined();
    const set = { ...production, AXIOM_TOKEN: "xaat-secret", AXIOM_DATASET: "travel-crm" };
    expect(loadEnvironment(set)).toMatchObject({ AXIOM_TOKEN: "xaat-secret", AXIOM_URL: "https://api.axiom.co" });
    expect(() => loadEnvironment({ ...production, AXIOM_TOKEN: "xaat-secret" })).toThrow(/AXIOM_DATASET: is needed/);
    expect(() => loadEnvironment({ ...production, AXIOM_DATASET: "travel-crm" })).toThrow(/AXIOM_TOKEN: is needed/);
    expect(() => loadEnvironment({ ...set, AXIOM_URL: "http://api.axiom.example" })).toThrow(
      /AXIOM_URL: must be https in production/,
    );
    expect(loadEnvironment({ ...set, NODE_ENV: "development", AXIOM_URL: "http://127.0.0.1:9" }).AXIOM_URL).toBe(
      "http://127.0.0.1:9",
    );
    // The token is never in the message of a refusal.
    expect(() => loadEnvironment({ ...set, AXIOM_URL: "nonsense" })).toThrow(/AXIOM_URL/);
    try {
      loadEnvironment({ ...set, AXIOM_URL: "nonsense" });
    } catch (error) {
      expect(String(error)).not.toContain("xaat-secret");
    }
  });

  it("treats an unset NODE_ENV as production, so a deploy that forgets it gets the production guards", () => {
    expect(() => loadEnvironment(valid)).toThrow(/BETTER_AUTH_URL: must be https in production/);
    expect(
      loadEnvironment({ ...valid, BETTER_AUTH_URL: "https://app.example.in", APP_URL: "https://app.example.in" })
        .NODE_ENV,
    ).toBe("production");
  });

  it("allows rate limiting off only in development and test", () => {
    for (const NODE_ENV of ["development", "test"]) {
      expect(loadEnvironment({ ...valid, NODE_ENV, AUTH_RATE_LIMIT: "false" }).AUTH_RATE_LIMIT).toBe(false);
    }
  });

  it("refuses weak secrets in production, naming the variable and never the value", () => {
    const production = {
      ...valid,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.in",
      APP_URL: "https://app.example.in",
    };
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

  it("refuses .env.example's VAPID pair in production, naming the variable and never the value", () => {
    const example = readFileSync(path.resolve(import.meta.dirname, "../../../.env.example"), "utf8");
    const exampleValue = (name: string) => new RegExp(`^${name}=(.+)$`, "m").exec(example)?.[1]?.trim() ?? "";
    const pair = {
      VAPID_PUBLIC_KEY: exampleValue("VAPID_PUBLIC_KEY"),
      VAPID_PRIVATE_KEY: exampleValue("VAPID_PRIVATE_KEY"),
    };
    expect(pair.VAPID_PUBLIC_KEY).toMatch(/^B[\w-]{86}$/);
    const production = {
      ...valid,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.in",
      APP_URL: "https://app.example.in",
      BETTER_AUTH_SECRET: "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug",
    };
    const attempt = () => loadEnvironment({ ...production, ...pair });
    expect(attempt).toThrow(/VAPID_PUBLIC_KEY: is \.env\.example's/);
    expect(attempt).not.toThrow(pair.VAPID_PUBLIC_KEY);
    expect(attempt).not.toThrow(pair.VAPID_PRIVATE_KEY);
    // A pair of the environment's own, and the example pair on a laptop, are fine.
    expect(() => loadEnvironment(production)).not.toThrow();
    expect(() => loadEnvironment({ ...valid, ...pair, NODE_ENV: "development" })).not.toThrow();
  });

  it("accepts only plain origins in TRUSTED_ORIGINS, and only https ones in production", () => {
    const bad = ["https://*.example.in", "https://app.example.in/path", "https://a.example?x=1", "ftp://a.example"];
    for (const TRUSTED_ORIGINS of bad) {
      expect(() => loadEnvironment({ ...valid, NODE_ENV: "development", TRUSTED_ORIGINS })).toThrow(/TRUSTED_ORIGINS/);
    }
    const production = {
      ...valid,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://app.example.in",
      APP_URL: "https://app.example.in",
    };
    const staging = () =>
      loadEnvironment({
        ...production,
        BETTER_AUTH_SECRET: "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug",
        TRUSTED_ORIGINS: "http://staging.example.in",
      });
    expect(staging).toThrow(/TRUSTED_ORIGINS/);
    // TRUSTED_ORIGINS is the only problem: the https APP_URL passes.
    expect(staging).not.toThrow(/APP_URL/);
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

  it("refuses proxy addresses Better Auth would never match: zone ids and IPv4-mapped IPv6", () => {
    const unmatched = [
      "fe80::1%eth0",
      "fe80::1%25eth0/64",
      "::ffff:10.0.0.1",
      "::ffff:10.0.0.0/104",
      "::FFFF:a00:1",
      "0:0:0:0:0:ffff:10.0.0.1",
    ];
    for (const AUTH_TRUSTED_PROXIES of unmatched) {
      expect(() => loadEnvironment({ ...valid, NODE_ENV: "development", AUTH_TRUSTED_PROXIES })).toThrow(
        /AUTH_TRUSTED_PROXIES/,
      );
    }
    // Plain IPv6 addresses and ranges stay accepted.
    expect(
      loadEnvironment({ ...valid, NODE_ENV: "development", AUTH_TRUSTED_PROXIES: "fe80::1,2001:db8::/32,::1" })
        .AUTH_TRUSTED_PROXIES,
    ).toEqual(["fe80::1", "2001:db8::/32", "::1"]);
  });

  it("names the product to authenticator apps with the brand's name", () => {
    expect(authSettingsFrom(loadEnvironment({ ...valid, NODE_ENV: "development" })).appName).toBe(brand.productName);
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

  it("needs object storage, email and web push settings, with AWS and SMTP defaults", () => {
    const environment = loadEnvironment({ ...valid, NODE_ENV: "development" });
    expect(environment).toMatchObject({
      APP_URL: "http://localhost:3000",
      S3_REGION: "ap-south-1",
      S3_FORCE_PATH_STYLE: false,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    });
    expect(environment.S3_ENDPOINT).toBeUndefined();
    const attempt = () =>
      loadEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: valid.DATABASE_URL,
        BETTER_AUTH_SECRET: valid.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: valid.BETTER_AUTH_URL,
        S3_BUCKET: "Not_A_Bucket",
        VAPID_SUBJECT: "dev@travel-crm.localhost",
      });
    expect(attempt).toThrow(/S3_BUCKET[\s\S]*SMTP_HOST[\s\S]*EMAIL_FROM_ADDRESS[\s\S]*VAPID_PUBLIC_KEY/);
    expect(attempt).toThrow(/VAPID_SUBJECT: must start with "mailto:" or "https:\/\/"/);
  });

  it("takes SMTP credentials only as a pair, naming the one that is missing", () => {
    const development = { ...valid, NODE_ENV: "development" };
    expect(() => loadEnvironment({ ...development, SMTP_USER: "mailer" })).toThrow(
      /SMTP_PASSWORD: is needed with SMTP_USER/,
    );
    expect(() => loadEnvironment({ ...development, SMTP_PASSWORD: "secret-password" })).toThrow(
      /SMTP_USER: is needed with SMTP_PASSWORD/,
    );
    expect(() => loadEnvironment({ ...development, SMTP_PASSWORD: "secret-password" })).not.toThrow(/secret-password/);
    expect(loadEnvironment({ ...development, SMTP_USER: "mailer", SMTP_PASSWORD: "secret-password" })).toMatchObject({
      SMTP_USER: "mailer",
    });
  });

  it("trusts the web app's address, so a password reset can send people back to it", () => {
    const development = { ...valid, NODE_ENV: "development" };
    const settings = authSettingsFrom(loadEnvironment({ ...development, TRUSTED_ORIGINS: "http://localhost:3000" }));
    expect(settings.trustedOrigins).toEqual(["http://localhost:3000"]);
    const staging = authSettingsFrom(loadEnvironment({ ...development, APP_URL: "https://staging.example.in/app" }));
    expect(staging.trustedOrigins).toEqual(["https://staging.example.in"]);
  });

  it("insists on HTTPS, secure cookies and rate limiting in production", () => {
    const production = { ...valid, NODE_ENV: "production" };
    expect(() => loadEnvironment(production)).toThrow(/BETTER_AUTH_URL: must be https in production/);
    const https = {
      ...production,
      BETTER_AUTH_URL: "https://app.example.in",
      APP_URL: "https://app.example.in",
      BETTER_AUTH_SECRET: "wB7qk2Rz9XvLm4TnY8cPa5HdJ3sFe6Ug",
    };
    expect(authSettingsFrom(loadEnvironment(https)).secureCookies).toBe(true);
    expect(() => loadEnvironment({ ...https, APP_URL: "http://app.example.in" })).toThrow(
      /APP_URL: must be https in production/,
    );
    expect(() => loadEnvironment({ ...https, AUTH_RATE_LIMIT: "false" })).toThrow(/AUTH_RATE_LIMIT/);
  });
});
