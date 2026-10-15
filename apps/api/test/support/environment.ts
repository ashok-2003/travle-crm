// A test environment for the services, as the api and the worker read it. Nothing listens on the discard port the
// bucket points at, so services.start() fails on the bucket unless a test points S3 somewhere real.
import { inject } from "vitest";
import { loadEnvironment, type Environment } from "../../src/environment.js";

export const testSecret = "a-long-enough-development-secret-123";

/** The variables, as process.env would hold them. */
export function testEnvironmentVariables(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "test",
    DATABASE_URL: inject("dbUrls").runtime,
    BETTER_AUTH_SECRET: testSecret,
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
  };
}

export function testEnvironment(overrides: Record<string, string> = {}): Environment {
  return loadEnvironment(testEnvironmentVariables(overrides));
}
