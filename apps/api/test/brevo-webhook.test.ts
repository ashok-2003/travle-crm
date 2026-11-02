// Brevo's transactional webhook (the failed-emails spec): POST /webhooks/brevo/<token> with a bearer key. Without both
// secrets, a bare 401 and nothing stored; with them, every body is stored and answered 200 (one event, a batch, or one
// it can't read). The worker marks the emails Brevo reports dropping failed, by the reference we sent on each, and
// changes nothing for any other event or for a reference it doesn't hold; twice gives the same rows.
import { randomBytes } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { emailLogStore, EMAIL_REFERENCE_HEADER, recordedEmailSender } from "@travel-crm/domain/email-log";
import { processWebhookEvent, type WebhookRequest } from "@travel-crm/domain/webhooks";
import type { EmailSender } from "@travel-crm/integrations/email";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { brevoEventsOf, brevoSettingsOf, brevoWebhookProvider } from "../src/brevo-webhook-provider.js";
import { EnvironmentError, loadEnvironment } from "../src/environment.js";
import { PATH_TOKEN_HEADER } from "../src/webhook-route.js";
import { createTestServer, type TestServer } from "./support/test-server.js";

const settings = { webhookToken: "t".repeat(16) + "0123456789abcdef", webhookKey: "k".repeat(16) + "fedcba9876543210" };
const at = 1_793_600_000_000;

/** One of Brevo's transactional events, as its webhook posts it. */
const brevoEvent = (event: string, reference: string | null, extra: Record<string, unknown> = {}) => ({
  event,
  email: "asha@agency.example",
  id: 123456,
  date: "2026-11-02 10:00:00",
  ts: Math.floor(at / 1000),
  "message-id": `<${crypto.randomUUID()}@smtp-relay.mailin.fr>`,
  ts_event: Math.floor(at / 1000),
  subject: "Reset your password",
  ...(reference === null ? {} : { "X-Mailin-custom": reference }),
  tags: [],
  ts_epoch: at,
  ...extra,
});

describe("Brevo's webhook", () => {
  let db: Database;
  let platform: PlatformClient;
  let server: TestServer;
  const provider = () => brevoWebhookProvider({ settings, db });

  beforeAll(() => {
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
    platform = createPlatformClient(inject("dbUrls").platform);
    server = createTestServer({}, { webhookProviders: [provider()] });
  });

  afterAll(async () => {
    await server.close();
    await platform.$disconnect();
    await db.disconnect();
  });

  /** An email sent through the recording wrapper; returns the reference Brevo would hand back. */
  async function sentEmail(): Promise<string> {
    let reference = "";
    const capturing: EmailSender = {
      send: (message) => {
        reference = message.headers?.[EMAIL_REFERENCE_HEADER] ?? "";
        return Promise.resolve();
      },
    };
    await recordedEmailSender(capturing, emailLogStore(db), createMemoryLogger()).send({
      to: { address: `asha-${crypto.randomUUID()}@agency.example` },
      fromName: "Example Sender",
      subject: "Reset your password",
      text: "Choose a new password",
      html: "<p>Choose a new password</p>",
      purpose: "password-reset",
    });
    return reference;
  }

  const post = (body: unknown, options: { token?: string; authorization?: string | null } = {}) =>
    server.app.request(`/webhooks/brevo/${options.token ?? settings.webhookToken}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.authorization === null
          ? {}
          : { authorization: options.authorization ?? `Bearer ${settings.webhookKey}` }),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  /** The stored event of the last delivery, processed as the worker would. */
  async function processLast(): Promise<void> {
    const stored = await platform.webhookEvent.findFirstOrThrow({
      where: { provider: "brevo" },
      orderBy: { receivedAt: "desc" },
    });
    await processWebhookEvent({ db, providers: [provider()] }, stored.id);
  }

  const rowOf = (id: string) => platform.emailLog.findUniqueOrThrow({ where: { id } });

  it("refuses anyone without both secrets, and stores nothing", async () => {
    const before = await platform.webhookEvent.count({ where: { provider: "brevo" } });
    const body = brevoEvent("hard_bounce", null);
    expect((await post(body, { token: "wrong-token-wrong-token-wrong-token" })).status).toBe(401);
    expect((await post(body, { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await post(body, { authorization: `Basic ${settings.webhookKey}` })).status).toBe(401);
    expect((await post(body, { authorization: null })).status).toBe(401);
    // The token in a header of the caller's own, on the path without one, is never taken.
    const forged = await server.app.request("/webhooks/brevo", {
      method: "POST",
      headers: { authorization: `Bearer ${settings.webhookKey}`, [PATH_TOKEN_HEADER]: settings.webhookToken },
      body: JSON.stringify(body),
    });
    expect(forged.status).toBe(401);
    expect(await platform.webhookEvent.count({ where: { provider: "brevo" } })).toBe(before);
  });

  it("marks the email a failure event names failed, with Brevo's event, reason and time, however often", async () => {
    const reference = await sentEmail();
    const body = brevoEvent("blocked", reference, { reason: "Account under review" });
    expect((await post(body)).status).toBe(200);
    await processLast();
    const row = await rowOf(reference);
    expect(row).toMatchObject({
      status: "failed",
      failureSource: "provider",
      failureCode: "blocked",
      failureReason: "Account under review",
      failedAt: new Date(at),
    });
    // Brevo delivers it again: stored once, and the row is the same.
    expect((await post(body)).status).toBe(200);
    await processLast();
    expect(await rowOf(reference)).toEqual(row);
  });

  it("handles each event of a batch, each failure kind, and changes nothing for the rest", async () => {
    const failures = ["hard_bounce", "soft_bounce", "spam", "invalid_email", "error"];
    const failed = await Promise.all(failures.map(() => sentEmail()));
    const others = ["request", "delivered", "deferred", "opened", "click", "unsubscribed", "proxy_open"];
    const untouched = await sentEmail();
    const batch = [
      ...failures.map((event, index) => brevoEvent(event, failed[index] ?? null)),
      ...others.map((event) => brevoEvent(event, untouched)),
      brevoEvent("hard_bounce", "0199a000-0000-7000-8000-0000000000f2"),
      brevoEvent("hard_bounce", null),
    ];
    expect((await post(batch)).status).toBe(200);
    await processLast();
    for (const [index, reference] of failed.entries()) {
      expect(await rowOf(reference)).toMatchObject({ status: "failed", failureCode: failures[index] });
    }
    expect(await rowOf(untouched)).toMatchObject({ status: "sent", failureCode: null });
  });

  it("identifies an event by its message, kind and time, and a batch or an unreadable body by its events or bytes", () => {
    const identify = (request: WebhookRequest) => provider().identify(request);
    const one = brevoEvent("hard_bounce", "ref");
    const again = { ...one, email: "someone-else@example.test" };
    const first = identify({ headers: new Headers(), rawBody: JSON.stringify(one) });
    expect(first).toEqual({
      eventId: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
      eventType: "brevo.hard_bounce",
    });
    expect(identify({ headers: new Headers(), rawBody: JSON.stringify(again) })).toEqual(first);
    expect(identify({ headers: new Headers(), rawBody: JSON.stringify({ ...one, event: "delivered" }) })).not.toEqual(
      first,
    );
    expect(identify({ headers: new Headers(), rawBody: JSON.stringify([one, one]) })?.eventType).toBe("brevo.batch");
    expect(identify({ headers: new Headers(), rawBody: "garbage" })).toEqual({
      eventId: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
      eventType: "brevo.unknown",
    });
  });

  it("stores a body it can't read, and does nothing with it", async () => {
    expect((await post("not json")).status).toBe(200);
    const stored = await platform.webhookEvent.findFirstOrThrow({
      where: { provider: "brevo" },
      orderBy: { receivedAt: "desc" },
    });
    expect(stored.eventType).toBe("brevo.unknown");
    await processLast();
  });
});

describe("Brevo's events", () => {
  it("reads one event or a batch, and nothing from a body that isn't either", () => {
    const one = brevoEvent("hard_bounce", "ref", { reason: "550 no such user" });
    expect(brevoEventsOf(JSON.stringify(one))).toEqual([
      {
        event: "hard_bounce",
        messageId: one["message-id"],
        reference: "ref",
        reason: "550 no such user",
        at: new Date(at),
      },
    ]);
    expect(brevoEventsOf(JSON.stringify([one, brevoEvent("delivered", null)])).map((event) => event.event)).toEqual([
      "hard_bounce",
      "delivered",
    ]);
    for (const body of ["", "null", "42", '"text"', "[1, 2]", '{"event": 7}', '{"event": "Not An Event"}']) {
      expect(brevoEventsOf(body)).toEqual([]);
    }
  });

  it("reads Brevo's time in milliseconds or seconds, and falls back to ts", () => {
    const inSeconds = new Date(Math.floor(at / 1000) * 1000);
    const timeOf = (event: object) => brevoEventsOf(JSON.stringify(event))[0]?.at;
    expect(timeOf(brevoEvent("error", null, { ts_epoch: Math.floor(at / 1000) }))).toEqual(inSeconds);
    expect(timeOf(brevoEvent("error", null, { ts_epoch: null }))).toEqual(inSeconds);
    expect(timeOf(brevoEvent("error", null, { ts_epoch: null, ts: "yesterday" }))).toBeNull();
  });
});

describe("Brevo's webhook settings", () => {
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
  const both = { BREVO_WEBHOOK_TOKEN: secret(), BREVO_WEBHOOK_KEY: secret() };

  it("are off when neither is set, or both are blank", () => {
    expect(brevoSettingsOf(loadEnvironment(base))).toBeNull();
    expect(brevoSettingsOf(loadEnvironment({ ...base, BREVO_WEBHOOK_TOKEN: "", BREVO_WEBHOOK_KEY: "" }))).toBeNull();
  });

  it("are on with both", () => {
    expect(brevoSettingsOf(loadEnvironment({ ...base, ...both }))).toEqual({
      webhookToken: both.BREVO_WEBHOOK_TOKEN,
      webhookKey: both.BREVO_WEBHOOK_KEY,
    });
  });

  it("refuse one without the other, naming the missing one and never a value", () => {
    for (const [given, missing] of [
      ["BREVO_WEBHOOK_TOKEN", "BREVO_WEBHOOK_KEY"],
      ["BREVO_WEBHOOK_KEY", "BREVO_WEBHOOK_TOKEN"],
    ] as const) {
      let message = "";
      try {
        loadEnvironment({ ...base, [given]: both[given] });
      } catch (error) {
        expect(error).toBeInstanceOf(EnvironmentError);
        message = (error as Error).message;
      }
      expect(message).toContain(`${missing}: is needed with ${given}`);
      expect(message).not.toContain(both[given]);
    }
  });

  it("refuse a token that can't sit in a URL path, a short key, and weak ones in production", () => {
    expect(() => loadEnvironment({ ...base, ...both, BREVO_WEBHOOK_TOKEN: `${secret()}/../x` })).toThrow(
      /BREVO_WEBHOOK_TOKEN/,
    );
    expect(() => loadEnvironment({ ...base, ...both, BREVO_WEBHOOK_KEY: "short" })).toThrow(/BREVO_WEBHOOK_KEY/);
    const weak = "a".repeat(40);
    let message = "";
    try {
      loadEnvironment({ ...base, BREVO_WEBHOOK_TOKEN: weak, BREVO_WEBHOOK_KEY: weak, NODE_ENV: "production" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("BREVO_WEBHOOK_TOKEN: is too weak for production");
    expect(message).toContain("BREVO_WEBHOOK_KEY: is too weak for production");
  });
});
