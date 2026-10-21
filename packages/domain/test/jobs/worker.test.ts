// The worker wires every kind of work to the runner and relays events, on the in-memory runner: an event published
// in an organization reaches its listener, handlers and schedules run, and mistakes in the wiring are refused. A
// process without listeners (the console) runs its handlers and schedules and relays nothing.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createMemoryJobQueue, createMemoryJobRunner, type JobData } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { publishEvent, startJobHandlers, startWorker } from "../../src/jobs/index.js";
import { recordingListener } from "./test-listeners.js";

async function eventually(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("startWorker", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Worker");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("relays a published event and runs its listener", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const listener = recordingListener("documents.render-pdf", "document.issued");
    const worker = await startWorker({
      db,
      runner,
      queue,
      listeners: [listener],
      relay: { intervalMs: 20, organizationIds: [organizationId] },
    });
    const eventId = await db.forOrg(organizationId, (tx) =>
      publishEvent(tx, { type: "document.issued", payload: { documentId: "w1" } }),
    );
    await eventually(() => queue.sent.some((job) => job.data.eventId === eventId));
    await runner.runQueued();
    await worker.stop();
    expect(listener.handled.map((event) => event.id)).toEqual([eventId]);
  });

  it("works each listener's queue one job at a time, so a worker reads one import's file at a time (X10)", async () => {
    const queue = createMemoryJobQueue();
    const memoryRunner = createMemoryJobRunner(queue);
    const worked: [string, unknown][] = [];
    const runner = {
      ...memoryRunner,
      work: (...args: Parameters<typeof memoryRunner.work>) => {
        worked.push([args[0], args[2]]);
        return memoryRunner.work(...args);
      },
    };
    const worker = await startWorker({
      db,
      runner,
      queue,
      listeners: [recordingListener("imports.read-file", "import.uploaded")],
      relay: { organizationIds: [] },
    });
    await worker.stop();
    expect(worked).toEqual([["imports.read-file", { concurrency: 1 }]]);
  });

  it("runs plain handlers, and registers schedules in their time zone", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const handled: JobData[] = [];
    const purged: JobData[] = [];
    const worker = await startWorker({
      db,
      runner,
      queue,
      listeners: [],
      relay: { organizationIds: [] },
      handlers: [
        {
          queue: "webhooks.process",
          handle: (data) => {
            handled.push(data);
            return Promise.resolve();
          },
        },
      ],
      schedules: [
        {
          queue: "rate-limits.purge",
          cron: "15 3 * * *",
          timeZone: "Asia/Kolkata",
          data: { olderThanDays: 1 },
          handle: (data) => {
            purged.push(data);
            return Promise.resolve();
          },
        },
      ],
    });
    await queue.send("webhooks.process", { webhookEventId: "w1" });
    await runner.fireSchedule("rate-limits.purge");
    await runner.runQueued();
    await worker.stop();

    expect(handled).toEqual([{ webhookEventId: "w1" }]);
    expect(purged).toEqual([{ olderThanDays: 1 }]);
    expect(runner.schedules).toEqual([
      { queue: "rate-limits.purge", cron: "15 3 * * *", timeZone: "Asia/Kolkata", data: { olderThanDays: 1 } },
    ]);
  });

  it("reports a job whose event isn't found, with ids only, and doesn't retry it", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const listener = recordingListener("documents.render-pdf", "document.issued");
    const errors: Error[] = [];
    const worker = await startWorker({
      db,
      runner,
      queue,
      listeners: [listener],
      relay: { organizationIds: [] },
      onError: (error) => errors.push(error as Error),
    });
    const eventId = "0199e7a0-0000-7000-8000-0000000000aa";
    await queue.send("documents.render-pdf", { organizationId, eventId, eventType: "document.issued" });
    await runner.runQueued();
    await worker.stop();

    expect(errors.map((error) => error.message)).toEqual([
      `documents.render-pdf: event ${eventId} not found in organization ${organizationId}`,
    ]);
    expect(runner.failed).toEqual([]);
    expect(listener.handled).toEqual([]);
  });

  it("doesn't retry a job whose event isn't found even if onError throws", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const listener = recordingListener("documents.render-pdf", "document.issued");
    const worker = await startWorker({
      db,
      runner,
      queue,
      listeners: [listener],
      relay: { organizationIds: [] },
      onError: () => {
        throw new Error("the logger is broken");
      },
    });
    await queue.send("documents.render-pdf", {
      organizationId,
      eventId: "0199e7a0-0000-7000-8000-0000000000cc",
      eventType: "document.issued",
    });
    await runner.runQueued();
    await worker.stop();
    expect(runner.failed).toEqual([]);
  });

  it("validates every schedule before registering any work", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const listener = recordingListener("documents.render-pdf", "document.issued");
    await expect(
      startWorker({
        db,
        runner,
        queue,
        listeners: [listener],
        relay: { organizationIds: [] },
        schedules: [{ queue: "x.y", cron: "every night", timeZone: "Asia/Kolkata", handle: () => Promise.resolve() }],
      }),
    ).rejects.toThrow(/cron expression/);
    await queue.send("documents.render-pdf", {
      organizationId,
      eventId: "0199e7a0-0000-7000-8000-0000000000bb",
      eventType: "document.issued",
    });
    // Nothing was registered: no handler took the job, and no schedule was kept.
    expect(await runner.runQueued()).toBe(0);
    expect(runner.schedules).toEqual([]);
  });

  it("registers schedules first, so a cron the runner refuses leaves no listener or relay running", async () => {
    const queue = createMemoryJobQueue();
    const memoryRunner = createMemoryJobRunner(queue);
    const runner = {
      work: (...args: Parameters<typeof memoryRunner.work>) => memoryRunner.work(...args),
      unschedule: (name: string) => memoryRunner.unschedule(name),
      schedule: (name: string, cron: string, options: Parameters<typeof memoryRunner.schedule>[2]) =>
        cron.includes("99") ? Promise.reject(new Error("invalid cron")) : memoryRunner.schedule(name, cron, options),
    };
    const listener = recordingListener("documents.render-pdf", "document.issued");
    const schedule = (name: string, cron: string) => ({
      queue: name,
      cron,
      timeZone: "Asia/Kolkata",
      handle: () => Promise.resolve(),
    });
    const eventId = await db.forOrg(organizationId, (tx) =>
      publishEvent(tx, { type: "document.issued", payload: { documentId: "w9" } }),
    );

    await expect(
      startWorker({
        db,
        runner,
        queue,
        listeners: [listener],
        relay: { intervalMs: 20, organizationIds: [organizationId] },
        schedules: [schedule("rate-limits.purge", "15 3 * * *"), schedule("rate-limits.bad", "99 99 * * *")],
      }),
    ).rejects.toThrow("invalid cron");
    await new Promise((resolve) => setTimeout(resolve, 200));

    // No relay ran (the event is still waiting) and no listener took a job; the schedule before the bad one stays.
    expect(queue.sent.filter((job) => job.data.eventId === eventId)).toEqual([]);
    expect(memoryRunner.schedules.map((kept) => kept.queue)).toEqual(["rate-limits.purge"]);
    await db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.updateMany({ where: { id: eventId }, data: { relayedAt: new Date() } }),
    );

    await queue.send("documents.render-pdf", { organizationId, eventId, eventType: "document.issued" });
    expect(await memoryRunner.runQueued()).toBe(0);
  });

  it("refuses two kinds of work on one queue, and a schedule in an unknown time zone", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const base = { db, runner, queue, relay: { organizationIds: [] } };
    await expect(
      startWorker({
        ...base,
        listeners: [
          recordingListener("documents.render-pdf", "document.issued"),
          recordingListener("documents.render-pdf", "document.reissued"),
        ],
      }),
    ).rejects.toThrow(/share the queue documents.render-pdf/);
    await expect(
      startWorker({
        ...base,
        listeners: [],
        schedules: [{ queue: "x.y", cron: "* * * * *", timeZone: "India/Mumbai", handle: () => Promise.resolve() }],
      }),
    ).rejects.toThrow(/unknown time zone/);
  });

  it("runs a process's handlers and schedules without listeners, leaving every event for the worker's relay", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const purged: JobData[] = [];
    const resets: JobData[] = [];
    const quiet = await createTestOrganization(platform, "Console jobs");
    const eventId = await db.forOrg(quiet, (tx) =>
      publishEvent(tx, { type: "document.issued", payload: { documentId: "c1" } }),
    );
    await startJobHandlers({
      runner,
      handlers: [
        {
          queue: "platform.purge-organization",
          handle: (data) => {
            purged.push(data);
            return Promise.resolve();
          },
        },
      ],
      schedules: [
        {
          queue: "platform.reset-demo",
          cron: "0 2 * * *",
          timeZone: "Asia/Kolkata",
          handle: (data) => {
            resets.push(data);
            return Promise.resolve();
          },
        },
      ],
    });
    await queue.send("platform.purge-organization", { organizationId: quiet });
    await runner.fireSchedule("platform.reset-demo");
    await runner.runQueued();

    expect(purged).toEqual([{ organizationId: quiet }]);
    expect(resets).toEqual([{}]);
    // A relay that knew no listeners would have marked the event relayed with nothing queued for it.
    const event = await db.forOrg(quiet, (tx) => tx.outboxEvent.findUniqueOrThrow({ where: { id: eventId } }));
    expect(event.relayedAt).toBeNull();
    await expect(
      startJobHandlers({
        runner,
        handlers: [{ queue: "a.b", handle: () => Promise.resolve() }],
        schedules: [{ queue: "a.b", cron: "* * * * *", timeZone: "Asia/Kolkata", handle: () => Promise.resolve() }],
      }),
    ).rejects.toThrow(/share the queue a.b/);
  });
});
