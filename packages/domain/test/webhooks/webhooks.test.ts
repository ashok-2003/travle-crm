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
        options: { id: stored?.id, retryLimit: 10, retryDelaySeconds: 30 },
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
    expect(await storedEvent(eventId)).toMatchObject({ attempts: 1, lastError: "Error" });
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
  it("stores no raw error message: only the error's name or code, kept short", async () => {
    const eventId = `evt_${crypto.randomUUID()}`;
    const failing: WebhookProvider = {
      ...exampleProvider([]),
      process: () =>
        Promise.reject(Object.assign(new Error("could not reach asha@example.com"), { name: "PaymentError" })),
    };
    const deps = { db, queue: createMemoryJobQueue(), providers: [failing] };
    await receiveWebhook(deps, "example", delivery({ id: eventId, type: "payment.captured" }));
    const id = (await storedEvent(eventId))?.id ?? "";
    await expect(processWebhookEvent(deps, id)).rejects.toThrow("asha@example.com");
    expect((await storedEvent(eventId))?.lastError).toBe("PaymentError");

    const coded: WebhookProvider = {
      ...failing,
      process: () => Promise.reject(Object.assign(new Error("secret detail"), { code: `E_${"X".repeat(200)}` })),
    };
    await expect(processWebhookEvent({ db, providers: [coded] }, id)).rejects.toThrow("secret detail");
    expect((await storedEvent(eventId))?.lastError).toBe(`E_${"X".repeat(98)}`);
  });

  it("answers 400, and stores nothing, for a signed body the provider can't read or a verify that throws", async () => {
    const { queue, deps } = setUp();
    const rawBody = "not json at all";
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
    const unreadable = { headers: new Headers({ "x-example-signature": signature }), rawBody };
    expect(await receiveWebhook(deps, "example", unreadable)).toEqual({ status: 400 });

    const throwing: WebhookProvider = {
      ...exampleProvider([]),
      verify: () => {
        throw new Error("verify blew up");
      },
    };
    const eventId = `evt_${crypto.randomUUID()}`;
    expect(
      await receiveWebhook({ db, queue, providers: [throwing] }, "example", delivery({ id: eventId, type: "t" })),
    ).toEqual({ status: 400 });
    expect(await storedEvent(eventId)).toBeNull();
    expect(queue.sent).toEqual([]);
  });

  it("accepts a verify that answers asynchronously", async () => {
    const eventId = `evt_${crypto.randomUUID()}`;
    const asynchronous: WebhookProvider = {
      ...exampleProvider([]),
      verify: (request) =>
        Promise.resolve(hmacSha256Signature({ secret, header: "x-example-signature", encoding: "hex" })(request)),
    };
    const queue = createMemoryJobQueue();
    const deps = { db, queue, providers: [asynchronous] };
    expect(await receiveWebhook(deps, "example", delivery({ id: eventId, type: "t" }))).toEqual({ status: 200 });
    expect(await receiveWebhook(deps, "example", { ...delivery({ id: eventId, type: "t" }), rawBody: "{}" })).toEqual({
      status: 401,
    });
  });

  it("stores one row and queues one job when two deliveries of an event arrive at once", async () => {
    const { queue, deps } = setUp();
    const eventId = `evt_${crypto.randomUUID()}`;
    const request = delivery({ id: eventId, type: "payment.captured" });
    const receipts = await Promise.all([
      receiveWebhook(deps, "example", request),
      receiveWebhook(deps, "example", request),
    ]);
    expect(receipts).toEqual([{ status: 200 }, { status: 200 }]);
    const rows = await db.withoutOrg((tx) => tx.webhookEvent.count({ where: { providerEventId: eventId } }));
    expect(rows).toBe(1);
    expect(queue.sent).toHaveLength(1);
  });

  it("queues the job on a repeat delivery when the first delivery's send failed", async () => {
    const memory = createMemoryJobQueue();
    let failNext = true;
    const queue = {
      send: (...args: Parameters<typeof memory.send>) => {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error("the queue is down"));
        }
        return memory.send(...args);
      },
    };
    const deps = { db, queue, providers: [exampleProvider([])] };
    const request = delivery({ id: `evt_${crypto.randomUUID()}`, type: "payment.captured" });
    await expect(receiveWebhook(deps, "example", request)).rejects.toThrow("the queue is down");
    expect(memory.sent).toEqual([]);
    expect(await receiveWebhook(deps, "example", request)).toEqual({ status: 200 });
    expect(memory.sent).toHaveLength(1);
  });

  it("throws, so the job retries, when the event's provider isn't registered", async () => {
    const { deps } = setUp();
    const eventId = `evt_${crypto.randomUUID()}`;
    await receiveWebhook(deps, "example", delivery({ id: eventId, type: "payment.captured" }));
    const id = (await storedEvent(eventId))?.id ?? "";
    await expect(processWebhookEvent({ db, providers: [] }, id)).rejects.toThrow(/No webhook provider named example/);
  });

  it("reports both errors when recording the failure fails too, naming neither message", async () => {
    const eventId = `evt_${crypto.randomUUID()}`;
    const failing: WebhookProvider = {
      ...exampleProvider([]),
      process: () => Promise.reject(new Error("handler failed for asha@example.com")),
    };
    await receiveWebhook(
      { db, queue: createMemoryJobQueue(), providers: [failing] },
      "example",
      delivery({ id: eventId, type: "t" }),
    );
    const id = (await storedEvent(eventId))?.id ?? "";
    let calls = 0;
    const flaky = {
      withoutOrg: ((...args: Parameters<Database["withoutOrg"]>) => {
        calls += 1;
        return calls === 2 ? Promise.reject(new Error("database down")) : db.withoutOrg(...args);
      }) as Database["withoutOrg"],
    };
    const error: unknown = await processWebhookEvent({ db: flaky, providers: [failing] }, id).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AggregateError);
    const { errors, message } = error as AggregateError;
    expect(errors.map((inner) => (inner as Error).message)).toEqual([
      "handler failed for asha@example.com",
      "database down",
    ]);
    expect(message).not.toMatch(/asha|database down/);
  });

  it("lets the api record attempts but never change a payload or delete an event", async () => {
    const { deps } = setUp();
    const eventId = `evt_${crypto.randomUUID()}`;
    await receiveWebhook(deps, "example", delivery({ id: eventId, type: "payment.captured" }));
    const id = (await storedEvent(eventId))?.id ?? "";
    await expect(
      db.withoutOrg((tx) => tx.$executeRaw`UPDATE webhook_event SET payload = 'changed' WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.withoutOrg((tx) => tx.$executeRaw`DELETE FROM webhook_event WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.withoutOrg((tx) => tx.$executeRaw`UPDATE webhook_event SET attempts = attempts + 1 WHERE id = ${id}::uuid`),
    ).resolves.toBe(1);
  });
});
