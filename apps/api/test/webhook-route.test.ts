// POST /webhooks/<provider>: hands the raw body and headers to the intake and answers its status; a body over 1 MB is
// refused with 413 before it is read in full.
import { createHmac } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { hmacSha256Signature, receiveWebhook, type WebhookRequest } from "@travel-crm/domain/webhooks";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { MAX_WEBHOOK_BODY_BYTES, webhookRoutes } from "../src/webhook-route.js";

describe("webhook route", () => {
  it("passes the provider name, headers and exact raw body to the intake, and answers its status", async () => {
    const received: { provider: string; request: WebhookRequest }[] = [];
    const app = webhookRoutes({
      receive: (provider, request) => {
        received.push({ provider, request });
        return Promise.resolve({ status: 401 });
      },
    });
    const body = '{"id":"evt_1","note":"₹12,50,000 — paid"}';
    const response = await app.request("/razorpay", {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": "abc" },
      body,
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({});
    expect(received[0]?.provider).toBe("razorpay");
    expect(received[0]?.request.rawBody).toBe(body);
    expect(received[0]?.request.headers.get("x-razorpay-signature")).toBe("abc");
  });

  it("refuses a body over 1 MB with 413, whether or not it says its length", async () => {
    let called = false;
    const app = webhookRoutes({
      receive: () => {
        called = true;
        return Promise.resolve({ status: 200 });
      },
    });
    const tooBig = "x".repeat(MAX_WEBHOOK_BODY_BYTES + 1);
    expect((await app.request("/example", { method: "POST", body: tooBig })).status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(tooBig));
        controller.close();
      },
    });
    // Node's fetch needs duplex to send a stream; the request then has no content-length.
    const streamed = await app.request("/example", { method: "POST", body: stream, duplex: "half" });
    expect(streamed.status).toBe(413);
    expect(called).toBe(false);
  });

  it("only takes POST", async () => {
    const app = webhookRoutes({ receive: () => Promise.resolve({ status: 200 }) });
    expect((await app.request("/example")).status).toBe(404);
  });
});

describe("webhook route against the database", () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it("stores a signed delivery once and queues one job, however often it arrives", async () => {
    const secret = "route-test-secret";
    const queue = createMemoryJobQueue();
    const provider = {
      name: "example",
      keptHeaders: ["x-example-signature"],
      verify: hmacSha256Signature({ secret, header: "x-example-signature", encoding: "hex" }),
      identify: ({ rawBody }: WebhookRequest) => {
        const { id } = JSON.parse(rawBody) as { id: string };
        return { eventId: id, eventType: "payment.captured" };
      },
      process: () => Promise.resolve(),
    };
    const app = webhookRoutes({
      receive: (name, request) => receiveWebhook({ db, queue, providers: [provider] }, name, request),
    });
    const body = JSON.stringify({ id: `evt_${crypto.randomUUID()}` });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const deliver = () =>
      app.request("/example", { method: "POST", headers: { "x-example-signature": signature }, body });

    expect((await deliver()).status).toBe(200);
    expect((await deliver()).status).toBe(200);
    expect(queue.sent).toHaveLength(1);
    expect((await app.request("/example", { method: "POST", body })).status).toBe(401);
  });
});
