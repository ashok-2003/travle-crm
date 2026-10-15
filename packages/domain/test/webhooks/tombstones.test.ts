// What a purge or an erasure does to stored webhook events (ADR 0013, ADR 0022): the worker keeps each event with the
// organization its handler found, and the platform role later blanks those events' payloads and headers, keeping the
// provider's id, so a replay is still ignored.
import { createHmac, randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { webhookEvents } from "@travel-crm/db/webhooks";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  hmacSha256Signature,
  processWebhookEvent,
  receiveWebhook,
  tombstoneWebhookEvents,
  type WebhookProvider,
} from "../../src/webhooks/index.js";

const secret = "tombstone-provider-secret";

/** A provider whose events name the organization they are about, in the payload, as Razorpay's notes do. */
const provider: WebhookProvider = {
  name: "notes",
  keptHeaders: ["x-notes-signature"],
  verify: hmacSha256Signature({ secret, header: "x-notes-signature", encoding: "hex" }),
  identify: ({ rawBody }) => ({ eventId: (JSON.parse(rawBody) as { id: string }).id, eventType: "payment.captured" }),
  process: (event, processing) => {
    processing.isAbout((JSON.parse(event.payload) as { organizationId: string }).organizationId);
    return Promise.resolve();
  },
};

describe("webhook tombstones", () => {
  let db: Database;
  let platformDb: PlatformDatabase;
  const queue = createMemoryJobQueue();

  beforeAll(() => {
    const urls = inject("dbUrls");
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await db.disconnect();
  });

  /** Delivers an event about the organization, carrying a customer's phone number, and returns its stored row's id. */
  async function delivered(
    organizationId: string,
    process = true,
  ): Promise<{ id: string; body: string; providerEventId: string }> {
    const providerEventId = `pay_${randomUUID()}`;
    const body = JSON.stringify({ id: providerEventId, organizationId, contact: "+919876543210" });
    const headers = new Headers({ "x-notes-signature": createHmac("sha256", secret).update(body).digest("hex") });
    await receiveWebhook({ db, queue, providers: [provider] }, "notes", { headers, rawBody: body });
    const row = await db.withoutOrg((tx) =>
      webhookEvents(tx).findUniqueOrThrow({
        where: { provider_providerEventId: { provider: "notes", providerEventId } },
      }),
    );
    if (process) await processWebhookEvent({ db, providers: [provider] }, row.id);
    return { id: row.id, body, providerEventId };
  }

  const rowOf = (id: string) => db.withoutOrg((tx) => webhookEvents(tx).findUniqueOrThrow({ where: { id } }));

  it("keeps each processed event with the organization its handler found", async () => {
    const organizationId = randomUUID();
    const event = await delivered(organizationId);
    expect(await rowOf(event.id)).toMatchObject({ resolvedOrganizationId: organizationId, tombstonedAt: null });
  });

  it("blanks the organization's processed events, keeping their ids, and leaves others and waiting ones alone", async () => {
    const organizationId = randomUUID();
    const done = await delivered(organizationId);
    const otherOrganizations = await delivered(randomUUID());
    expect(await platformDb.transaction((tx) => tombstoneWebhookEvents(tx, organizationId))).toEqual({
      tombstoned: 1,
      waiting: 0,
    });
    expect(await rowOf(done.id)).toMatchObject({
      provider: "notes",
      providerEventId: done.providerEventId,
      payload: "",
      headers: {},
      tombstonedAt: expect.any(Date) as Date,
    });
    expect((await rowOf(otherOrganizations.id)).payload).toBe(otherOrganizations.body);
    // A replay of the blanked event is still recognised, and stores nothing.
    const replay = new Headers({ "x-notes-signature": createHmac("sha256", secret).update(done.body).digest("hex") });
    expect(
      await receiveWebhook({ db, queue, providers: [provider] }, "notes", { headers: replay, rawBody: done.body }),
    ).toEqual({ status: 200 });
    expect((await rowOf(done.id)).payload).toBe("");
    // Tombstoning again finds nothing more.
    expect(await platformDb.transaction((tx) => tombstoneWebhookEvents(tx, organizationId))).toEqual({
      tombstoned: 0,
      waiting: 0,
    });
  });

  it("can't be done by the runtime role", async () => {
    const organizationId = randomUUID();
    await delivered(organizationId);
    await expect(db.withoutOrg((tx) => tombstoneWebhookEvents(tx, organizationId))).rejects.toThrow(
      /permission denied/,
    );
  });
});
