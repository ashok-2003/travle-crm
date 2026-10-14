// The webhook intake (spec 9.7) against Postgres: verify, store raw, queue a job, reply 200; then the worker processes
// each event once, however often the provider delivers it.
import { createHmac } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createMemoryJobQueue, type MemoryJobQueue } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  hmacSha256Signature,
  processWebhookEvent,
  processWebhookJob,
  receiveWebhook,
  WEBHOOK_PROCESS_QUEUE,
  type StoredWebhookEvent,
  type WebhookProvider,
} from "../../src/webhooks/index.js";

const secret = "example-provider-secret";

/** A provider like Razorpay's: an HMAC of the raw body in a header, the event's id and type in the JSON. */
function exampleProvider(processed: StoredWebhookEvent[], fail = { times: 0 }): WebhookProvider {
  return {
    name: "example",
    keptHeaders: ["x-example-signature", "x-example-delivery", "cookie", "authorization"],
    verify: hmacSha256Signature({ secret, header: "x-example-signature", encoding: "hex" }),
    identify: ({ rawBody }) => {
      const parsed = JSON.parse(rawBody) as { id?: unknown; type?: unknown };
      return typeof parsed.id === "string" && typeof parsed.type === "string"
        ? { eventId: parsed.id, eventType: parsed.type }
        : null;
    },
    process: (event) => {
      if (fail.times > 0) {
        fail.times -= 1;
        return Promise.reject(new Error("the provider's handler failed"));
      }
      processed.push(event);
      return Promise.resolve();
    },
  };
}

function delivery(body: object, headers: Record<string, string> = {}) {
  const rawBody = JSON.stringify(body);
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  return { headers: new Headers({ "x-example-signature": signature, ...headers }), rawBody };
}

describe("webhook intake", () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
  });

  const storedEvent = (providerEventId: string) =>
    db.withoutOrg((tx) =>
      tx.webhookEvent.findUnique({ where: { provider_providerEventId: { provider: "example", providerEventId } } }),
    );

  function setUp(fail = { times: 0 }) {
    const processed: StoredWebhookEvent[] = [];
    const queue: MemoryJobQueue = createMemoryJobQueue();
    const providers = [exampleProvider(processed, fail)];
    return { processed, queue, providers, deps: { db, queue, providers } };
  }

  it("stores a verified delivery exactly as received, queues it, and answers 200", async () => {
    const { queue, deps } = setUp();
    const eventId = `evt_${crypto.randomUUID()}`;
    const request = delivery({ id: eventId, type: "payment.captured", amount: 125000000 });

    expect(await receiveWebhook(deps, "example", request)).toEqual({ status: 200 });

    const stored = await storedEvent(eventId);
    expect(stored).toMatchObject({ eventType: "payment.captured", payload: request.rawBody, processedAt: null });
    expect(queue.sent).toEqual([
      {
        id: stored?.id,
        queue: WEBHOOK_PROCESS_QUEUE,
        data: { webhookEventId: stored?.id },
        options: { id: stored?.id },
      },
    ]);
  });

  it("answers 200 to a repeated delivery and stores and queues nothing more", async () => {
    const { queue, deps } = setUp();
    const request = delivery({ id: `evt_${crypto.randomUUID()}`, type: "payment.captured" });
    await receiveWebhook(deps, "example", request);
    expect(await receiveWebhook(deps, "example", request)).toEqual({ status: 200 });
    expect(queue.sent).toHaveLength(1);
  });

  it("refuses a bad signature with 401 and stores nothing", async () => {
    const { queue, deps } = setUp();
    const eventId = `evt_${crypto.randomUUID()}`;
    const forged = { ...delivery({ id: eventId, type: "payment.captured" }), rawBody: JSON.stringify({ id: eventId }) };
    expect(await receiveWebhook(deps, "example", forged)).toEqual({ status: 401 });
    expect(await storedEvent(eventId)).toBeNull();
    expect(queue.sent).toEqual([]);
  });

  it("answers 404 for a provider it doesn't know, and 400 for an event it can't identify", async () => {
    const { deps } = setUp();
    expect(await receiveWebhook(deps, "nobody", delivery({ id: "evt_x", type: "t" }))).toEqual({ status: 404 });
    expect(await receiveWebhook(deps, "example", delivery({ type: "no id" }))).toEqual({ status: 400 });
  });

  it("keeps only the headers the provider names, and never cookies or authorization", async () => {
    const { deps } = setUp();
    const eventId = `evt_${crypto.randomUUID()}`;
    await receiveWebhook(
      deps,
      "example",
      delivery(
        { id: eventId, type: "payment.captured" },
        { "x-example-delivery": "d-1", cookie: "session=secret", authorization: "Bearer secret", "x-other": "dropped" },
      ),
    );
    const headers = (await storedEvent(eventId))?.headers as Record<string, string>;
    expect(Object.keys(headers).sort()).toEqual(["x-example-delivery", "x-example-signature"]);
  });

  it("processes a stored event once, however many times its job runs", async () => {
    const { processed, deps } = setUp();
    const eventId = `evt_${crypto.randomUUID()}`;
    await receiveWebhook(deps, "example", delivery({ id: eventId, type: "payment.captured" }));
    const id = (await storedEvent(eventId))?.id ?? "";

    expect(await processWebhookJob(deps, { webhookEventId: id })).toBe("processed");
    expect(await processWebhookJob(deps, { webhookEventId: id })).toBe("already-processed");
    expect(processed.map((event) => [event.providerEventId, event.eventType])).toEqual([[eventId, "payment.captured"]]);
    expect(await storedEvent(eventId)).toMatchObject({ attempts: 1, lastError: null });
    expect((await storedEvent(eventId))?.processedAt).toBeInstanceOf(Date);
  });

  it("records a failed attempt and rethrows so the job retries, then succeeds", async () => {
    const { processed, deps } = setUp({ times: 1 });
    const eventId = `evt_${crypto.randomUUID()}`;
    await receiveWebhook(deps, "example", delivery({ id: eventId, type: "payment.captured" }));
    const id = (await storedEvent(eventId))?.id ?? "";

    await expect(processWebhookEvent(deps, id)).rejects.toThrow("the provider's handler failed");
    expect(await storedEvent(eventId)).toMatchObject({ attempts: 1, lastError: "the provider's handler failed" });
    expect(await processWebhookEvent(deps, id)).toBe("processed");
    expect(await storedEvent(eventId)).toMatchObject({ attempts: 2, lastError: null });
    expect(processed).toHaveLength(1);
  });

  it("finds nothing for an unknown event id, and refuses a job without one", async () => {
    const { deps } = setUp();
    expect(await processWebhookEvent(deps, "0199e7a0-0000-7000-8000-00000000dead")).toBe("event-not-found");
    expect(await processWebhookEvent(deps, "not-a-uuid")).toBe("event-not-found");
    await expect(processWebhookJob(deps, {})).rejects.toThrow(/webhookEventId/);
  });
});
