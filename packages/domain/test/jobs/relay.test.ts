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
  relayBackoffMs,
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

  it("rolls back a batch whose send fails part way, and sends each listener's job once on the next pass", async () => {
    const { queue: counted, memory, calls } = countingQueue();
    const organizationId = await createTestOrganization(platform, "Relay crash");
    const eventId = await publish(organizationId, "document.issued", { documentId: "c1" });
    let sends = 0;
    // Two listeners hear document.issued, so the event makes two sends; the second one fails.
    const crashing = {
      send: (name: string, data: Parameters<typeof counted.send>[1], options?: Parameters<typeof counted.send>[2]) => {
        sends += 1;
        if (sends === 2) return Promise.reject(new Error("pg-boss unavailable"));
        return counted.send(name, data, options);
      },
    };

    await expect(relayOutbox({ db, queue: crashing, listeners, organizationIds: [organizationId] })).rejects.toThrow(
      AggregateError,
    );
    expect(await relayedAt(organizationId, eventId)).toBeNull();
    expect(memory.sent).toHaveLength(1);

    expect(await relayOutbox({ db, queue: counted, listeners, organizationIds: [organizationId] })).toBe(1);
    // 1 send before the crash + 2 on the retry (one per listener); the memory queue ignores the repeated job id.
    expect(calls()).toBe(3);
    expect(memory.sent.map((job) => job.queue)).toEqual(["documents.render-pdf", "notifications.document-issued"]);
    expect(await relayedAt(organizationId, eventId)).toBeInstanceOf(Date);
  });

  it("relays each event once when two relays overlap: the second takes other events while the first is sending", async () => {
    const { queue: counted, calls } = countingQueue();
    const organizationId = await createTestOrganization(platform, "Relay race");
    for (const documentId of ["r1", "r2", "r3", "r4"]) await publish(organizationId, "document.issued", { documentId });

    let firstSendReached: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      firstSendReached = resolve;
    });
    let openGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    let first = true;
    // The first relay's first send waits until the second relay is done, so the two passes really overlap.
    const slowFirst = {
      send: async (
        name: string,
        data: Parameters<typeof counted.send>[1],
        options?: Parameters<typeof counted.send>[2],
      ) => {
        if (first) {
          first = false;
          firstSendReached();
          await gate;
        }
        return counted.send(name, data, options);
      },
    };

    const firstPass = relayOutbox({ db, queue: slowFirst, listeners, organizationIds: [organizationId], batchSize: 2 });
    await reached;
    const secondPass = await relayOutbox({
      db,
      queue: counted,
      listeners,
      organizationIds: [organizationId],
      batchSize: 2,
    });
    openGate();
    expect([await firstPass, secondPass]).toEqual([2, 2]);
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

  it("keeps relaying other organizations when one fails, reports it with ids only, and then throws", async () => {
    const { queue: working, memory } = countingQueue();
    const broken = await createTestOrganization(platform, "Relay broken");
    const healthy = await createTestOrganization(platform, "Relay healthy");
    await publish(broken, "notification.created", { notificationId: "b1" });
    const healthyEvent = await publish(healthy, "notification.created", { notificationId: "h1" });
    const queue = {
      send: (name: string, data: Parameters<typeof working.send>[1], options?: Parameters<typeof working.send>[2]) =>
        data.organizationId === broken
          ? Promise.reject(new Error("mail jane@example.com"))
          : working.send(name, data, options),
    };

    const error = await relayOutbox({ db, queue, listeners, organizationIds: [broken, healthy] }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AggregateError);
    const failures = (error as AggregateError).errors as Error[];
    expect(failures.map((failure) => failure.message)).toEqual([`Relaying organization ${broken} failed`]);
    expect(failures[0]?.cause).toMatchObject({ message: "mail jane@example.com" });
    expect(memory.sent.map((job) => job.data.eventId)).toEqual([healthyEvent]);
    expect(await relayedAt(healthy, healthyEvent)).toBeInstanceOf(Date);
  });

  it("refuses limits that aren't positive whole numbers", async () => {
    const { queue } = countingQueue();
    const base = { db, queue, listeners, organizationIds: [] };
    await expect(relayOutbox({ ...base, batchSize: 0 })).rejects.toThrow(RangeError);
    expect(() => startOutboxRelay({ ...base, organizationsPerPass: 1.5 })).toThrow(RangeError);
    expect(() => startOutboxRelay({ ...base, batchSize: -1 })).toThrow(RangeError);
    expect(() => startOutboxRelay({ ...base, intervalMs: 0 })).toThrow(RangeError);
  });

  it("waits longer after each failed pass, up to a minute, and starts over after a good one", () => {
    expect(relayBackoffMs(0, 1000)).toBe(1000);
    expect([1, 2, 3, 4].map((failures) => relayBackoffMs(failures, 1000))).toEqual([2000, 4000, 8000, 16_000]);
    expect(relayBackoffMs(10, 1000)).toBe(60_000);
    // Never shorter than the poll interval itself.
    expect(relayBackoffMs(1, 100_000)).toBe(100_000);
    expect(relayBackoffMs(5, 100_000)).toBe(100_000);
  });

  it("backs off while the queue is down instead of retrying at the poll interval", async () => {
    const organizationId = await createTestOrganization(platform, "Relay backoff");
    await publish(organizationId, "notification.created", { notificationId: "bo1" });
    const errors: unknown[] = [];
    const relay = startOutboxRelay({
      db,
      listeners,
      organizationIds: [organizationId],
      intervalMs: 50,
      onError: (error) => errors.push(error),
      queue: { send: () => Promise.reject(new Error("pg-boss unavailable")) },
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await relay.stop();
    // Every organization it tried failed, so it backs off. Waits of 100, 200, 400, ... ms between attempts: at most about 5 in a second (20 without backoff).
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.length).toBeLessThanOrEqual(6);
  });

  it("keeps the normal interval when only some organizations fail", async () => {
    const { queue: working } = countingQueue();
    const broken = await createTestOrganization(platform, "Relay partly broken");
    const healthy = await createTestOrganization(platform, "Relay partly healthy");
    await publish(broken, "notification.created", { notificationId: "pb1" });
    const errors: unknown[] = [];
    const relay = startOutboxRelay({
      db,
      listeners,
      organizationIds: [broken, healthy],
      intervalMs: 50,
      onError: (error) => errors.push(error),
      queue: {
        send: (name, data, options) =>
          data.organizationId === broken ? Promise.reject(new Error("unavailable")) : working.send(name, data, options),
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await relay.stop();
    // The broken organization fails on every pass, at the 50 ms interval: about 40 passes in 2 s, and still well over
    // 10 when a busy machine slows each pass down. With the whole relay backing off (100, 200, 400, 800 ms) it would be
    // at most 6.
    expect(errors.length).toBeGreaterThanOrEqual(10);
  });

  it("stops between organizations", async () => {
    const { queue: working } = countingQueue();
    const first = await createTestOrganization(platform, "Relay stop first");
    const second = await createTestOrganization(platform, "Relay stop second");
    const firstEvent = await publish(first, "notification.created", { notificationId: "s1" });
    const secondEvent = await publish(second, "notification.created", { notificationId: "s2" });
    let stopping: Promise<void> = Promise.resolve();
    const relay = startOutboxRelay({
      db,
      listeners,
      organizationIds: [first, second],
      intervalMs: 50,
      queue: {
        send: (name, data, options) => {
          stopping = relay.stop();
          return working.send(name, data, options);
        },
      },
    });
    await stopping.then(() => relay.stop());
    expect(await relayedAt(first, firstEvent)).toBeInstanceOf(Date);
    expect(await relayedAt(second, secondEvent)).toBeNull();
    // Let go of the event so nothing else sees it as waiting.
    await platform.outboxEvent.update({ where: { id: secondEvent }, data: { relayedAt: new Date() } });
  });

  it("survives an onError that throws", async () => {
    const { queue: working, memory } = countingQueue();
    const organizationId = await createTestOrganization(platform, "Relay bad handler");
    let failNext = true;
    let reported = 0;
    const relay = startOutboxRelay({
      db,
      listeners,
      organizationIds: [organizationId],
      intervalMs: 50,
      onError: () => {
        reported += 1;
        throw new Error("the logger is broken");
      },
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
    const eventId = await publish(organizationId, "notification.created", { notificationId: "eh1" });
    const deadline = Date.now() + 10_000;
    while (!memory.sent.some((job) => job.data.eventId === eventId) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await relay.stop();
    expect(reported).toBe(1);
    expect(memory.sent.filter((job) => job.data.eventId === eventId)).toHaveLength(1);
  });
});
