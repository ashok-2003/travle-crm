// The worker wires every kind of work to the runner and relays events, on the in-memory runner: an event published
// in an organization reaches its listener, handlers and schedules run, and mistakes in the wiring are refused.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createMemoryJobQueue, createMemoryJobRunner, type JobData } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { publishEvent, startWorker } from "../../src/jobs/index.js";
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
});
