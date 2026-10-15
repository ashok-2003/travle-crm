// The api's one log (spec 9.1): an unexpected error, in tRPC, in a route or in Better Auth, becomes one `api: ...` line
// of names and codes. A Prisma validation error quotes the query's values (here a person's name, email and phone);
// none of them reaches the console, in development or in production, and the caller gets a page or JSON that says
// nothing either.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createIdentity, type Identity } from "@travel-crm/domain/identity";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { processLog } from "../src/process-log.js";
import { clientAddressFrom } from "../src/rate-limit.js";
import { consoleOutput } from "./support/console-output.js";
import { ORIGIN, testAuthSettings } from "./support/test-server.js";

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

  beforeAll(async () => {
    leak = await validationErrorUnder(mode);
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 1 });
    identity = createIdentity({
      databaseUrl: inject("dbUrls").runtime,
      maxConnections: 2,
      auth: { ...testAuthSettings, log: processLog("api") },
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
      db,
      files: { systemDownloadLink: () => Promise.reject(leak) },
      queue: createMemoryJobQueue(),
      rateLimiter: { hit: () => Promise.reject(leak) },
      clientAddress: clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies: [] }),
      webhookProviders: [],
      log: processLog("api"),
    });

  it("has the error as a person's data in it, to begin with", () => {
    expect(leak.message).toMatch(/Jane Doe/);
    expect(leak.message).toMatch(/jane\.doe@example\.com/);
    expect(leak.message).toMatch(/98765 43210/);
  });

  it("logs a failing tRPC call by its path and names, and answers 'Something went wrong'", async () => {
    const output = consoleOutput();
    const response = await failingApp().request("/api/trpc/me.get", { headers: { origin: ORIGIN } });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(leaked);
    expect(output()).toEqual([
      "api: tRPC me.get failed: TRPCError INTERNAL_SERVER_ERROR, caused by PrismaClientValidationError",
    ]);
  });

  it("answers a share link that fails with the link page, kept private, and logs the area, never the token", async () => {
    const output = consoleOutput();
    const token = "a".repeat(65);
    const response = await failingApp().request(`/p/${token}`, { headers: { "x-forwarded-for": "203.0.113.90" } });
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const page = await response.text();
    expect(page).toContain("This link doesn't work");
    expect(page).not.toMatch(leaked);
    expect(output()).toEqual(["api: GET /p failed: PrismaClientValidationError"]);
  });

  it("answers any other route that fails with plan 2's internal error JSON", async () => {
    const output = consoleOutput();
    const response = await failingApp().request("/webhooks/example", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.91" },
      body: "{}",
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" });
    expect(output()).toEqual(["api: POST /webhooks failed: PrismaClientValidationError"]);
  });

  it("puts Better Auth's own lines in the log with personal data masked", async () => {
    const output = consoleOutput();
    const response = await failingApp().request("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({
        email: "jane.doe@example.com",
        redirectTo: "https://phishing.example/?to=jane.doe@example.com",
      }),
    });
    expect(response.status).toBe(403);
    expect(output()).toEqual(["api: auth error: Invalid redirectURL: https://phishing.example/?to=[email]"]);
  });
});
