// The Meta lead ads' settings (ADR 0034): all five or none, each checked, the values never in a message, and the fake
// Graph's address for development and tests only.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadEnvironment } from "../src/environment.js";
import { metaSettingsOf, metaStartUpLine } from "../src/meta-settings.js";

const base = {
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
  NODE_ENV: "development",
};
const key = () => randomBytes(32).toString("base64");
const all = {
  META_APP_ID: "1234567890123456",
  META_APP_SECRET: "0123456789abcdef0123456789abcdef",
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-with-at-least-32-characters-long",
  META_LOGIN_CONFIG_ID: "9876543210",
  META_TOKEN_KEY: key(),
};

describe("the Meta settings", () => {
  it("are off when none is set, and a compose file's blanks are the same as unset", () => {
    expect(metaSettingsOf(loadEnvironment(base))).toBeNull();
    const blanks = Object.fromEntries(Object.keys(all).map((name) => [name, ""]));
    expect(metaSettingsOf(loadEnvironment({ ...base, ...blanks }))).toBeNull();
    expect(metaStartUpLine(null)).toBe("Meta lead ads: not set up");
  });

  it("are on when all five are set", () => {
    const settings = metaSettingsOf(loadEnvironment({ ...base, ...all }));
    expect(settings).toMatchObject({
      appId: all.META_APP_ID,
      loginConfigId: all.META_LOGIN_CONFIG_ID,
      tokenKeys: [all.META_TOKEN_KEY],
    });
    expect(metaStartUpLine(settings)).toBe("Meta lead ads: on");
  });

  it("stop the process when only some are set, naming each missing variable and no value", () => {
    for (const present of Object.keys(all)) {
      const only = { ...base, [present]: all[present as keyof typeof all] };
      expect(() => loadEnvironment(only)).toThrow(/META_/);
      try {
        loadEnvironment(only);
      } catch (error) {
        const message = String(error);
        expect(message).toContain("is needed with the other Meta settings");
        for (const value of Object.values(all)) expect(message).not.toContain(value);
      }
    }
    const withoutKey: Record<string, string> = { ...base, ...all };
    delete withoutKey.META_TOKEN_KEY;
    expect(() => loadEnvironment(withoutKey)).toThrow(/META_TOKEN_KEY: is needed/);
  });

  it("checks each value's shape without printing it", () => {
    const bad = (name: string, value: string, message: RegExp) => {
      expect(() => loadEnvironment({ ...base, ...all, [name]: value })).toThrow(message);
      try {
        loadEnvironment({ ...base, ...all, [name]: value });
      } catch (error) {
        expect(String(error)).not.toContain(value);
      }
    };
    bad("META_APP_ID", "not-an-id", /META_APP_ID/);
    bad("META_APP_SECRET", "short", /META_APP_SECRET/);
    bad("META_WEBHOOK_VERIFY_TOKEN", "too-short-token", /META_WEBHOOK_VERIFY_TOKEN/);
    bad("META_LOGIN_CONFIG_ID", "abc", /META_LOGIN_CONFIG_ID/);
    bad("META_TOKEN_KEY", "c2hvcnQ=", /META_TOKEN_KEY/);
    bad("META_TOKEN_KEY", `${key()},c2hvcnQ=`, /META_TOKEN_KEY/);
  });

  it("takes a list of token keys, newest first", () => {
    const newer = key();
    const older = key();
    const settings = metaSettingsOf(loadEnvironment({ ...base, ...all, META_TOKEN_KEY: ` ${newer}, ${older} ` }));
    expect(settings?.tokenKeys).toEqual([newer, older]);
  });

  it("refuses a weak verify token in production, and the fake Graph's address there", () => {
    const production = {
      ...base,
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://api.example.in",
      APP_URL: "https://app.example.in",
    };
    expect(() => loadEnvironment({ ...production, ...all, META_WEBHOOK_VERIFY_TOKEN: "a".repeat(40) })).toThrow(
      /META_WEBHOOK_VERIFY_TOKEN: is too weak/,
    );
    expect(loadEnvironment({ ...production, ...all }).META_APP_ID).toBe(all.META_APP_ID);
    expect(() => loadEnvironment({ ...production, ...all, META_GRAPH_TEST_SERVER_URL: "http://127.0.0.1:9" })).toThrow(
      /META_GRAPH_TEST_SERVER_URL: is for development and tests only/,
    );
    expect(
      loadEnvironment({ ...base, ...all, META_GRAPH_TEST_SERVER_URL: "http://127.0.0.1:9" }).META_GRAPH_TEST_SERVER_URL,
    ).toBe("http://127.0.0.1:9");
  });
});
