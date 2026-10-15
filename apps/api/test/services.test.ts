// What the api runs on is built from the environment: start() refuses to go on when the storage bucket can't be
// used, before pg-boss starts, and the rate limiter's key is derived from the auth secret rather than set apart.
import { describe, expect, inject, it } from "vitest";
import { loadEnvironment } from "../src/environment.js";
import { createServices, rateLimitKeySecret } from "../src/services.js";

const secret = "a-long-enough-development-secret-123";

describe("services", () => {
  it("refuses to start when the storage bucket can't be reached", async () => {
    const services = createServices(
      loadEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: inject("dbUrls").runtime,
        BETTER_AUTH_SECRET: secret,
        BETTER_AUTH_URL: "http://localhost:3001",
        // Nothing listens on the discard port.
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
      }),
    );
    try {
      await expect(services.start()).rejects.toThrow(`The storage bucket "travel-crm" can't be used: unreachable`);
    } finally {
      await services.close();
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
