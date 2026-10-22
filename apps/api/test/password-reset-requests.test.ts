// How a password-reset request is protected around the email: Better Auth limits requests per client address, a
// sender that fails, even before it starts, never changes the answer, and no failure puts the reset link in a log.
import { randomUUID } from "node:crypto";
import { createDatabase } from "@travel-crm/db";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import type { EmailSender } from "@travel-crm/integrations/email";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { passwordResetEmails } from "../src/password-reset-email.js";
import {
  createTestAgency,
  createTestServer,
  ORIGIN,
  postJson,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";

const resetPage = `${ORIGIN}/reset-password`;
const keySecret = "password-reset-requests-secret-32-bytes";

describe("password reset requests", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    // Only the answers matter here, so the sender sends nothing.
    server = createTestServer({
      rateLimit: true,
      passwordReset: { sendEmail: () => Promise.resolve(), pageUrl: resetPage },
    });
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("are rate limited per client address: three a minute", async () => {
    const ask = (address: string) =>
      postJson(
        server,
        "/api/auth/request-password-reset",
        { email: agency.owner.email, redirectTo: resetPage },
        undefined,
        { "x-forwarded-for": address },
      );
    for (let attempt = 0; attempt < 3; attempt += 1) expect((await ask("203.0.113.40")).status).toBe(200);
    const refused = await ask("203.0.113.40");
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("x-retry-after") ?? refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await ask("203.0.113.41")).status).toBe(200);
  });
});

describe("a password-reset sender that fails", () => {
  it("answers a real address before the sender starts, even one that throws at once, and logs no link", async () => {
    let calls = 0;
    const server = createTestServer({
      passwordReset: {
        sendEmail: () => {
          calls += 1;
          throw new Error("could not deliver http://localhost/api/auth/reset-password/secret-token-1");
        },
        pageUrl: resetPage,
      },
    });
    try {
      const agency = await createTestAgency(server);
      const asked = await postJson(server, "/api/auth/request-password-reset", {
        email: agency.owner.email,
        redirectTo: resetPage,
      });
      expect(asked.status).toBe(200);
      expect(await asked.json()).toMatchObject({ status: true });
      // Answered first: the send starts on a later turn of the event loop.
      expect(calls).toBe(0);
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(calls).toBe(1);
      expect(server.logger.entries.filter((entry) => entry.level === "error").map((entry) => entry.msg)).toEqual([
        "A password-reset email could not be sent",
      ]);
      expect(JSON.stringify(server.logger.entries)).not.toMatch(/secret-token|deliver/);
    } finally {
      await server.close();
    }
  });

  it("keeps the reset link out of the log when sending fails", async () => {
    const logger = createMemoryLogger();
    const url = "http://localhost/api/auth/reset-password/secret-reset-token-123?callbackURL=http%3A%2F%2Flocalhost";
    // A library error that quotes the message it failed to send, link and all.
    const failing: EmailSender = { send: () => Promise.reject(new Error(`could not deliver: ${url}`)) };
    const db = createDatabase(inject("dbUrls").runtime, { maxConnections: 1 });
    try {
      await passwordResetEmails(
        failing,
        createRateLimiter(db, { keySecret }),
        logger,
      )({
        to: { name: "Asha", address: `asha-${randomUUID()}@example.test` },
        url,
      });
    } finally {
      await db.disconnect();
    }
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: "error",
      msg: "Could not send a password-reset email",
      errorName: "Error",
    });
    expect(JSON.stringify(logger.entries)).not.toMatch(/secret-reset-token|deliver/);
  });
});
