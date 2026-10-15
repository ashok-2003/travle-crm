// What the api runs on is built from the environment: start() refuses to go on when the storage bucket can't be
// used, before pg-boss starts; the rate limiter's key is derived from the auth secret rather than set apart; and the
// password-reset email goes out through the SMTP sender to APP_URL's reset page.
import { createPlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { describe, expect, inject, it } from "vitest";
import { loadEnvironment } from "../src/environment.js";
import { createServices, rateLimitKeySecret } from "../src/services.js";
import { startMailpit } from "./support/mailpit.js";

const secret = "a-long-enough-development-secret-123";

/** A test environment for the services; nothing listens on the discard port the bucket points at. */
const environment = (overrides: Record<string, string> = {}) =>
  loadEnvironment({
    NODE_ENV: "test",
    DATABASE_URL: inject("dbUrls").runtime,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: "http://localhost:3001",
    S3_ENDPOINT: "http://127.0.0.1:9",
    S3_FORCE_PATH_STYLE: "true",
    S3_BUCKET: "travel-crm",
    S3_ACCESS_KEY_ID: "minio-dev",
    S3_SECRET_ACCESS_KEY: "minio-dev-secret",
    SMTP_HOST: "localhost",
    EMAIL_FROM_ADDRESS: "no-reply@travel-crm.localhost",
    // The dev-only pair from .env.example: web push checks the keys' shape.
    VAPID_PUBLIC_KEY: "BNDwagd-1gwbRjL1o3iP9g4zUvYkczzP1yE9xNbcidEzKkDbvrHaBCyHQi8btoNnI9IMV7CoQun_1oMlSCz5lTY",
    VAPID_PRIVATE_KEY: "UrS7-d1PFp4TPIVRSD5qGMXmRPN_NbpYvsJxhc6j3nU",
    VAPID_SUBJECT: "mailto:dev@travel-crm.localhost",
    ...overrides,
  });

describe("services", () => {
  it("refuses to start when the storage bucket can't be reached", async () => {
    const services = createServices(environment());
    try {
      await expect(services.start()).rejects.toThrow(`The storage bucket "travel-crm" can't be used: unreachable`);
    } finally {
      await services.close();
    }
  });

  it("sends password-reset emails through the SMTP sender, back to APP_URL's reset page and nowhere else", async () => {
    const mailpit = await startMailpit();
    const services = createServices(
      environment({
        SMTP_HOST: mailpit.smtpHost,
        SMTP_PORT: String(mailpit.smtpPort),
        APP_URL: "http://localhost:3000",
        // One request from no forwarded address: Better Auth's own limit isn't what this checks.
        AUTH_RATE_LIMIT: "false",
      }),
    );
    const platform = createPlatformClient(inject("dbUrls").platform);
    try {
      const organizationId = await createTestOrganization(platform, "Services agency");
      await services.identity.seedStarterRoles(organizationId);
      const email = `owner-${organizationId}@example.test`;
      await services.identity.createOrganizationOwner(organizationId, {
        name: "Asha Owner",
        email,
        password: "owner-password-1",
        mustChangePassword: false,
      });
      const ask = (redirectTo: string) =>
        services.identity.auth.handler(
          new Request("http://localhost:3001/api/auth/request-password-reset", {
            method: "POST",
            headers: { "content-type": "application/json", origin: "http://localhost:3000" },
            body: JSON.stringify({ email, redirectTo }),
          }),
        );
      expect((await ask("http://localhost:3000/sign-in")).status).toBe(403);
      expect((await ask("http://localhost:3000/reset-password")).status).toBe(200);
      const [message] = await mailpit.messagesOnceThereAre(1);
      expect(message).toMatchObject({
        From: { Address: "no-reply@travel-crm.localhost" },
        To: [{ Address: email }],
        Subject: "Reset your password",
      });
      expect(message?.Text).toContain("callbackURL=http%3A%2F%2Flocalhost%3A3000%2Freset-password");
    } finally {
      await services.close();
      await platform.$disconnect();
      await mailpit.stop();
    }
  });

  it("derives the rate limiter's 32-byte key from the auth secret, the same way every time", () => {
    const key = rateLimitKeySecret(secret);
    expect(key).toHaveLength(32);
    expect(rateLimitKeySecret(secret)).toEqual(key);
    expect(rateLimitKeySecret(`${secret}-rotated`)).not.toEqual(key);
    expect(Buffer.from(key).toString("utf8")).not.toContain(secret.slice(0, 8));
  });
});
