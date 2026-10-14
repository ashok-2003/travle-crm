// End to end on real pg-boss: an event published inside db.forOrg() reaches its listener through the relay and a
// pg-boss queue, and a listener that always fails ends in the failed-jobs list after its retries.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { listenerJobId, publishEvent, startWorker, type Worker } from "../../src/jobs/index.js";
import { recordingListener } from "./test-listeners.js";

async function eventually(check: () => Promise<boolean> | boolean, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe("worker on pg-boss", () => {
  const delivered = recordingListener("workerprobe.render-document", "document.issued");
  const broken = recordingListener("workerprobe.always-fails", "notification.created");
  let platform: PlatformClient;
  let db: Database;
  let jobs: PgBossJobs;
  let worker: Worker;
  let organizationId: string;
  const errors: unknown[] = [];

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Worker on pg-boss");
    jobs = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 3,
      pollingIntervalSeconds: 0.5,
      // One quick retry, so a failing listener reaches the failed list within the test.
      retryPolicy: { retryLimit: 1, retryDelaySeconds: 1, retryDelayMaxSeconds: 1 },
      onError: (error) => errors.push(error),
    });
    await jobs.start();
    broken.failuresLeft = Number.POSITIVE_INFINITY;
    worker = await startWorker({
      db,
      runner: jobs,
      queue: jobs,
      listeners: [delivered, broken],
      relay: { intervalMs: 100, organizationIds: [organizationId] },
      onError: (error) => errors.push(error),
    });
  });

  afterAll(async () => {
    await worker.stop();
    await jobs.stop();
    await db.disconnect();
    await platform.$disconnect();
    // The only errors are the originals of the listener that always fails; nothing from pg-boss itself.
    expect(errors.filter((error) => !(error as Error).message.includes("failed on purpose"))).toEqual([]);
  });

  it("delivers an event published in an organization to its listener", async () => {
    const eventId = await db.forOrg(organizationId, (tx) =>
      publishEvent(tx, { type: "document.issued", payload: { documentId: "p1" } }),
    );
    await eventually(() => delivered.handled.some((event) => event.id === eventId));
    expect(delivered.handled.find((event) => event.id === eventId)).toMatchObject({
      organizationId,
      payload: { documentId: "p1" },
    });
  });

  it("lists a listener's job as failed after its retries", async () => {
    const eventId = await db.forOrg(organizationId, (tx) =>
      publishEvent(tx, { type: "notification.created", payload: { notificationId: "n1" } }),
    );
    const jobId = listenerJobId("workerprobe.always-fails", eventId);
    await eventually(async () => (await jobs.failedJobs()).some((job) => job.id === jobId));
    expect((await jobs.failedJobs()).find((job) => job.id === jobId)).toMatchObject({
      queue: "workerprobe.always-fails",
      data: { organizationId, eventId, eventType: "notification.created" },
      attempts: 2,
      error: "Error: workerprobe.always-fails failed on purpose",
    });
    expect(broken.handled).toEqual([]);
  });
});
