// The api's structured log (spec 9.1, ADR 0032): an unexpected error, in tRPC, in a route or in Better Auth, becomes a
// line of names, a code and stack frames. A Prisma validation error quotes the query's values (here a person's name,
// email and phone); none of them reaches the log, in development or in production, and the caller gets a page or
// JSON that says nothing either.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createFiles } from "@travel-crm/domain/files";
import { createIdentity, type Identity } from "@travel-crm/domain/identity";
import { createProfiles } from "@travel-crm/domain/profile";
import { createSubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryLogger, type MemoryLogger } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loggerOfRequest } from "../src/request-log.js";
import { clientAddressFrom } from "../src/rate-limit.js";
import { ORIGIN, TEST_PUSH_PUBLIC_KEY, testAuthSettings } from "./support/test-server.js";

const personal = "Jane Doe, jane.doe@example.com, +91 98765 43210";
const leaked = /Jane Doe|jane\.doe|98765/;

/** `target` with some of its members replaced; every other member is the real one. */
function overriding<T extends object>(target: T, replacements: Partial<T>): T {
  return new Proxy(target, {
    get: (real, property, receiver) =>
      property in replacements
        ? (replacements as Record<string | symbol, unknown>)[property]
        : (Reflect.get(real, property, receiver) as unknown),
  });
}

/** A real PrismaClientValidationError, made by a client built under this NODE_ENV: its message quotes the values. */
async function validationErrorUnder(mode: string): Promise<Error> {
  vi.stubEnv("NODE_ENV", mode);
  const db = createDatabase(inject("dbUrls").runtime, { maxConnections: 1 });
  try {
    const failed = await db
      .forOrg(randomUUID(), (tx) =>
        tx.notification.create({
          data: { recipientUserId: randomUUID(), kind: "share-link.opened", title: personal, body: 42 } as never,
        }),
      )
      .then(
        () => null,
        (error: unknown) => error as Error,
      );
    if (failed?.name !== "PrismaClientValidationError") throw new Error("expected a Prisma validation error");
    return failed;
  } finally {
    await db.disconnect();
    vi.unstubAllEnvs();
  }
}

describe.each(["development", "production"])("the api's log under NODE_ENV=%s", (mode) => {
  let leak: Error;
  let identity: Identity;
  let db: Database;
  // Uncensored: each line is exactly what the call site passed, so the leak checks below prove the call sites.
  const logger: MemoryLogger = createMemoryLogger({ censor: false });

  beforeAll(async () => {
    leak = await validationErrorUnder(mode);
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 1 });
    identity = createIdentity({
      databaseUrl: inject("dbUrls").runtime,
      maxConnections: 2,
      auth: { ...testAuthSettings, log: loggerOfRequest(logger) },
    });
  });

  afterAll(async () => {
    await identity.disconnect();
    await db.disconnect();
  });

  /** The app, with the session lookup, the rate limiter and the file links all failing with the leak. */
  const failingApp = () =>
    createApp({
      identity: overriding(identity, {
        auth: overriding(identity.auth, {
          api: overriding(identity.auth.api, {
            getSession: (() => Promise.reject(leak)) as unknown as Identity["auth"]["api"]["getSession"],
          }),
        }),
      }),
      subscriptions: createSubscriptionAccess({ db }),
      profiles: createProfiles({ db }),
      db,
      files: overriding(createFiles({ db, storage: createMemoryStorage() }), {
        systemDownloadLink: () => Promise.reject(leak),
      }),
      pushPublicKey: TEST_PUSH_PUBLIC_KEY,
      queue: createMemoryJobQueue(),
      rateLimiter: { hit: () => Promise.reject(leak) },
      clientAddress: clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies: [] }),
      webhookProviders: [],
      logger,
    });

  it("has the error as a person's data in it, to begin with", () => {
    expect(leak.message).toMatch(/Jane Doe/);
    expect(leak.message).toMatch(/jane\.doe@example\.com/);
    expect(leak.message).toMatch(/98765 43210/);
  });

  /** The lines written since the test began, and a check that none of them holds the leak. */
  function linesOf(): MemoryLogger["entries"] {
    expect(JSON.stringify(logger.entries)).not.toMatch(leaked);
    return logger.entries;
  }

  beforeEach(() => {
    logger.entries.length = 0;
  });

  it("logs a failing tRPC call by its procedure, error and frames, and answers 'Something went wrong'", async () => {
    const response = await failingApp().request("/api/trpc/me.get", { headers: { origin: ORIGIN } });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(leaked);
    const [fault, request] = linesOf();
    expect(fault).toMatchObject({
      level: "error",
      msg: "tRPC call failed",
      procedure: "me.get",
      errorName: "PrismaClientValidationError",
    });
    expect(fault?.errorStack).toMatch(/^\s*at /);
    expect(request).toMatchObject({
      level: "error",
      route: "/api/trpc",
      procedures: ["me.get"],
      status: 500,
      errorName: "PrismaClientValidationError",
    });
    expect(fault?.requestId).toBe(request?.requestId);
    // Proven: a fault's line names the procedure and the error's name, cause and frames: no message, input or path.
    expect(Object.keys(fault ?? {}).sort()).toEqual([
      "errorName",
      "errorStack",
      "level",
      "msg",
      "procedure",
      "requestId",
    ]);
  });

  it("answers a share link that fails with the link page, kept private, and logs the area, never the token", async () => {
    const token = "a".repeat(65);
    const response = await failingApp().request(`/p/${token}`, { headers: { "x-forwarded-for": "203.0.113.90" } });
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const page = await response.text();
    expect(page).toContain("This link doesn't work");
    expect(page).not.toMatch(leaked);
    expect(JSON.stringify(logger.entries)).not.toContain(token);
    const [fault, request] = linesOf();
    expect(fault).toMatchObject({ level: "error", msg: "unhandled error", method: "GET", area: "/p" });
    expect(fault).toMatchObject({ errorName: "PrismaClientValidationError" });
    expect(request).toMatchObject({ route: "/p/*", status: 500, requestId: fault?.requestId });
    // Proven: the unhandled-error line has the method, the area (never the token) and the error's fields.
    expect(Object.keys(fault ?? {}).sort()).toEqual([
      "area",
      "errorName",
      "errorStack",
      "level",
      "method",
      "msg",
      "requestId",
    ]);
  });

  it("answers any other route that fails with plan 2's internal error JSON", async () => {
    const response = await failingApp().request("/webhooks/example", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.91" },
      body: "{}",
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" });
    expect(linesOf()[0]).toMatchObject({ msg: "unhandled error", method: "POST", area: "/webhooks" });
  });

  it("puts Better Auth's own lines in the log with personal data masked, under the request's id", async () => {
    const response = await failingApp().request("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({
        email: "jane.doe@example.com",
        redirectTo: "https://phishing.example/?to=jane.doe@example.com",
      }),
    });
    expect(response.status).toBe(403);
    const [auth, request] = linesOf();
    expect(auth).toMatchObject({
      level: "error",
      source: "better-auth",
      msg: "auth: Invalid redirectURL: https://phishing.example",
    });
    expect(request).toMatchObject({
      route: "/api/auth/request-password-reset",
      status: 403,
      requestId: auth?.requestId,
    });
  });
});
