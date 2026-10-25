// The WhatsApp settings (ADR 0035): all three or none, each checked, the values never in a message, and the fake MSG91's
// address for development and tests only.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EnvironmentError, loadEnvironment } from "../src/environment.js";
import { whatsappSettingsOf, whatsappStartUpLine } from "../src/whatsapp-settings.js";

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
const secret = () => randomBytes(32).toString("hex");
const all = { MSG91_AUTHKEY: "msg91-account-key", MSG91_WEBHOOK_TOKEN: secret(), MSG91_WEBHOOK_KEY: secret() };

describe("the WhatsApp settings", () => {
  it("are off when none is set, and a compose file's blanks are the same as unset", () => {
    expect(whatsappSettingsOf(loadEnvironment(base))).toBeNull();
    const blanks = Object.fromEntries(Object.keys(all).map((name) => [name, ""]));
    expect(whatsappSettingsOf(loadEnvironment({ ...base, ...blanks }))).toBeNull();
    expect(whatsappStartUpLine(null)).toBe("WhatsApp: not set up");
  });

  it("are on when all three are set, and the start-up line holds no value", () => {
    const settings = whatsappSettingsOf(loadEnvironment({ ...base, ...all }));
    expect(settings).toMatchObject({ authKey: all.MSG91_AUTHKEY, webhookToken: all.MSG91_WEBHOOK_TOKEN });
    expect(whatsappStartUpLine(settings)).toBe("WhatsApp: on");
  });

  it("refuse a group with one missing, naming the missing variable and never a value", () => {
    const two = { MSG91_AUTHKEY: all.MSG91_AUTHKEY, MSG91_WEBHOOK_TOKEN: all.MSG91_WEBHOOK_TOKEN };
    let message = "";
    try {
      loadEnvironment({ ...base, ...two });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentError);
      message = (error as Error).message;
    }
    expect(message).toContain("MSG91_WEBHOOK_KEY");
    expect(message).not.toContain(all.MSG91_WEBHOOK_TOKEN);
  });

  it("refuse a token that cannot sit in a URL path, and a short key", () => {
    expect(() => loadEnvironment({ ...base, ...all, MSG91_WEBHOOK_TOKEN: `${secret()}/../x` })).toThrow(
      /MSG91_WEBHOOK_TOKEN/,
    );
    expect(() => loadEnvironment({ ...base, ...all, MSG91_WEBHOOK_KEY: "short" })).toThrow(/MSG91_WEBHOOK_KEY/);
  });

  it("keep the fake MSG91's address to development", () => {
    const url = { MSG91_TEST_SERVER_URL: "http://localhost:4010" };
    expect(whatsappSettingsOf(loadEnvironment({ ...base, ...all, ...url }))?.testServerUrl).toBe(
      "http://localhost:4010",
    );
    expect(() => loadEnvironment({ ...base, ...url })).toThrow(/MSG91_TEST_SERVER_URL/);
  });

  it("never let the fake's address, the one non-MSG91 origin that may carry the key, into production", () => {
    const url = { MSG91_TEST_SERVER_URL: "http://localhost:4010" };
    for (const NODE_ENV of ["production", undefined]) {
      const environment = { ...base, ...all, ...url, ...(NODE_ENV === undefined ? {} : { NODE_ENV }) };
      if (NODE_ENV === undefined) delete (environment as Partial<typeof base>).NODE_ENV;
      expect(() => loadEnvironment(environment), String(NODE_ENV)).toThrow(
        /MSG91_TEST_SERVER_URL: is for development and tests only/,
      );
    }
  });
});
