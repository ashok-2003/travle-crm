// The outbox relay queues one job per listener per event, with ids only, marks events relayed, and never queues an
// event twice: not on a second pass, not after a crash between sending and marking, not with two relays at once.
// Every relay here names its organizations: test files share one database, and a relay that looked at every
// organization would take other files' events.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  listenerJobId,
  organizationsWithEventsWaiting,
  publishEvent,
  relayOutbox,
  startOutboxRelay,
} from "../../src/jobs/index.js";
import { countingQueue, recordingListener } from "./test-listeners.js";

const renderPdf = recordingListener("documents.render-pdf", "document.issued");
const notifyIssuer = recordingListener("notifications.document-issued", "document.issued");
const deliver = recordingListener("notifications.deliver", "notification.created");
const listeners = [renderPdf, notifyIssuer, deliver];

describe("outbox relay", () => {
  let platform: PlatformClient;
  let db: Database;
  let agencyA: string;
  let agencyB: string;

  const publish = (organizationId: string, type: string, payload = {}) =>
    db.forOrg(organizationId, (tx) => publishEvent(tx, { type, payload }));
  const relayedAt = async (organizationId: string, eventId: string) =>
    (await db.forOrg(organizationId, (tx) => tx.outboxEvent.findUniqueOrThrow({ where: { id: eventId } }))).relayedAt;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    agencyA = await createTestOrganization(platform, "Relay A");
    agencyB = await createTestOrganization(platform, "Relay B");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("queues a job on each listener's queue for each event, with ids only, and marks the events relayed", async () => {
    const { queue, memory } = countingQueue();
    const issuedA = await publish(agencyA, "document.issued", { documentId: "d1" });
    const createdB = await publish(agencyB, "notification.created", { notificationId: "n1" });

    expect(await relayOutbox({ db, queue, listeners, organizationIds: [agencyA, agencyB] })).toBe(2);

    expect(memory.sent.map(({ queue: name, data, id }) => ({ name, data, id }))).toEqual([
      {
        name: "documents.render-pdf",
        data: { organizationId: agencyA, eventId: issuedA, eventType: "document.issued" },
        id: listenerJobId("documents.render-pdf", issuedA),
      },
      {
        name: "notifications.document-issued",
        data: { organizationId: agencyA, eventId: issuedA, eventType: "document.issued" },
        id: listenerJobId("notifications.document-issued", issuedA),
      },
      {
        name: "notifications.deliver",
        data: { organizationId: agencyB, eventId: createdB, eventType: "notification.created" },
        id: listenerJobId("notifications.deliver", createdB),
      },
    ]);
    expect(await relayedAt(agencyA, issuedA)).toBeInstanceOf(Date);
    expect(await relayedAt(agencyB, createdB)).toBeInstanceOf(Date);
  });

  it("sends nothing on a second pass", async () => {
    const { queue, calls } = countingQueue();
    await publish(agencyA, "document.issued", { documentId: "d2" });
    await relayOutbox({ db, queue, listeners, organizationIds: [agencyA] });
    const sent = calls();
    expect(await relayOutbox({ db, queue, listeners, organizationIds: [agencyA] })).toBe(0);
    expect(calls()).toBe(sent);
  });

  it("queues nothing new when an event is relayed again after a crash", async () => {
    const { queue, memory } = countingQueue();
    const eventId = await publish(agencyA, "document.issued", { documentId: "d3" });
    await relayOutbox({ db, queue, listeners, organizationIds: [agencyA] });
    // As if the relay had crashed after sending but before its transaction marked the event.
    await platform.outboxEvent.update({ where: { id: eventId }, data: { relayedAt: null } });

    expect(await relayOutbox({ db, queue, listeners, organizationIds: [agencyA] })).toBe(1);
    expect(memory.sent.filter((job) => job.data.eventId === eventId)).toHaveLength(2);
  });

  it("relays each event once when two relays run at the same time", async () => {
    const { queue, calls } = countingQueue();
    const organizationId = await createTestOrganization(platform, "Relay race");
    for (const documentId of ["r1", "r2", "r3", "r4"]) await publish(organizationId, "document.issued", { documentId });

    const passes = await Promise.all([
      relayOutbox({ db, queue, listeners, organizationIds: [organizationId] }),
      relayOutbox({ db, queue, listeners, organizationIds: [organizationId] }),
    ]);
    expect(passes[0] + passes[1]).toBe(4);
    expect(calls()).toBe(8);
  });

  it("marks an event nobody listens to as relayed, and gives a listener only its own event type", async () => {
    const { queue, memory } = countingQueue();
    const eventId = await publish(agencyB, "nobody.listens", {});
    await relayOutbox({ db, queue, listeners, organizationIds: [agencyB] });
    expect(memory.sent.filter((job) => job.data.eventId === eventId)).toEqual([]);
    expect(await relayedAt(agencyB, eventId)).toBeInstanceOf(Date);
  });

  it("finds the organizations with events waiting, oldest first", async () => {
    // Read-only, so it can't take other test files' events: every relay in these tests names its organizations.
    const first = await createTestOrganization(platform, "Relay finds first");
    const second = await createTestOrganization(platform, "Relay finds second");
    await publish(first, "document.issued", { documentId: "f1" });
    await publish(second, "document.issued", { documentId: "f2" });
    const waiting = await organizationsWithEventsWaiting(db, 1000);
    expect(waiting.indexOf(first)).toBeGreaterThanOrEqual(0);
    expect(waiting.indexOf(first)).toBeLessThan(waiting.indexOf(second));
    expect(waiting).not.toContain(agencyA);
  });

  it("keeps relaying in a loop after an error, until stopped", async () => {
    const { queue: working, memory } = countingQueue();
    let failNext = true;
    const errors: unknown[] = [];
    const organizationId = await createTestOrganization(platform, "Relay loop");
    const relay = startOutboxRelay({
      db,
      listeners,
      organizationIds: [organizationId],
      intervalMs: 50,
      onError: (error) => errors.push(error),
      queue: {
        send: (name, data, options) => {
          if (failNext) {
            failNext = false;
            return Promise.reject(new Error("pg-boss unavailable"));
          }
          return working.send(name, data, options);
        },
      },
    });
    const eventId = await publish(organizationId, "notification.created", { notificationId: "n2" });
    const deadline = Date.now() + 10_000;
    while (!memory.sent.some((job) => job.data.eventId === eventId) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await relay.stop();
    expect(errors).toHaveLength(1);
    expect(memory.sent.filter((job) => job.data.eventId === eventId)).toHaveLength(1);
  });
});
