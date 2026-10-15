// The console's job that empties the deletions' outbox (ADR 0022): it deletes each due file, then its row; one file
// storage refuses holds up no other: its row stays for the next run, and the run fails so the job is retried; a row
// not yet due gets one follow-up run, queued for when it is; and an hourly sweep sits beside the job.
import { randomUUID } from "node:crypto";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { startJobHandlers } from "../../src/jobs/index.js";
import {
  deleteDueFiles,
  DELETE_STORED_FILES_QUEUE,
  runStoredFileDeletions,
  storedFileDeletionsSchedule,
  SWEEP_STORED_FILES_QUEUE,
} from "../../src/platform/file-deletions.js";
import { platformJobHandlers } from "../../src/platform/index.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

const MINUTE_MS = 60 * 1000;

describe("deleting the queued files", () => {
  let test: TestPlatform;
  let platform: PlatformClient;

  beforeAll(() => {
    test = createTestPlatform();
    platform = createPlatformClient(inject("dbUrls").platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });

  it("deletes every file it can, keeps the rows of those storage refused, and fails the run", async () => {
    // The outbox outlives its organization, so these need none: ids are all it holds.
    const organizationId = randomUUID();
    const files = [randomUUID(), randomUUID(), randomUUID()];
    const keyOf = (id: string) => `organizations/${organizationId}/attachments/${id}`;
    const now = new Date();
    for (const id of files) {
      await test.storage.put({ key: keyOf(id), contentType: "application/pdf", body: new Uint8Array([1]) });
    }
    await platform.storedFileDeletion.createMany({
      data: files.map((attachmentId) => ({ targetOrganizationId: organizationId, attachmentId, dueAt: now })),
    });
    // Storage refuses the first file only, as an object lock on one key would.
    const refused = keyOf(files[0] ?? "");
    const services = {
      ...test.services,
      storage: {
        ...test.storage,
        delete: (key: string) =>
          key === refused ? Promise.reject(new Error("AccessDenied")) : test.storage.delete(key),
      },
    };

    await expect(deleteDueFiles(services, { now, organizationId })).rejects.toMatchObject({
      name: "FileDeletionsFailedError",
      message: "1 queued file deletions failed and 2 finished",
    });
    expect([...test.storage.objects.keys()].filter((key) => key.includes(organizationId))).toEqual([refused]);
    expect(
      await platform.storedFileDeletion.findMany({
        where: { targetOrganizationId: organizationId },
        select: { attachmentId: true },
      }),
    ).toEqual([{ attachmentId: files[0] }]);

    // A later run, once storage lets it, finishes.
    expect(await deleteDueFiles(test.services, { now, organizationId })).toBe(1);
    expect(await platform.storedFileDeletion.count({ where: { targetOrganizationId: organizationId } })).toBe(0);
  });

  it("gives a row left after a run one follow-up run, queued for when it is due, which deletes it", async () => {
    const organizationId = randomUUID();
    const attachmentId = randomUUID();
    const key = `organizations/${organizationId}/attachments/${attachmentId}`;
    await test.storage.put({ key, contentType: "application/pdf", body: new Uint8Array([1]) });
    const now = new Date();
    const dueAt = new Date(now.getTime() + 15 * MINUTE_MS);
    await platform.storedFileDeletion.create({ data: { targetOrganizationId: organizationId, attachmentId, dueAt } });
    const followUps = () =>
      test.queue.sent.filter(
        (sent) =>
          sent.queue === DELETE_STORED_FILES_QUEUE &&
          sent.options.startAfter?.getTime() === dueAt.getTime() + MINUTE_MS,
      );

    // Nothing due yet (pg-boss started the job early, or this is another row's run): the next run is queued for it.
    await runStoredFileDeletions(test.services, { now, organizationId });
    expect(test.storage.objects.has(key)).toBe(true);
    expect(followUps().map((sent) => [sent.data, sent.options.retryLimit])).toEqual([[{ organizationId }, 30]]);
    // Run early again: it is the same job, so nothing more is queued, and no run queues itself in a loop.
    await runStoredFileDeletions(test.services, { now, organizationId });
    expect(followUps()).toHaveLength(1);

    // The follow-up, once due, deletes it, without a new purge, and leaves nothing to queue.
    const sent = test.queue.sent.length;
    await runStoredFileDeletions(test.services, { now: new Date(dueAt.getTime() + MINUTE_MS), organizationId });
    expect(test.storage.objects.has(key)).toBe(false);
    expect(await platform.storedFileDeletion.count({ where: { targetOrganizationId: organizationId } })).toBe(0);
    expect(test.queue.sent).toHaveLength(sent);
  });

  it("sweeps every hour beside the job, on a queue of its own", async () => {
    const schedule = storedFileDeletionsSchedule(test.services);
    expect(schedule).toMatchObject({ queue: SWEEP_STORED_FILES_QUEUE, cron: "0 * * * *", timeZone: "Asia/Kolkata" });
    // Registered with the platform's handlers, it shares no queue with them (the runner would refuse that).
    const runner = createMemoryJobRunner(createMemoryJobQueue());
    await startJobHandlers({ runner, handlers: platformJobHandlers(test.services), schedules: [schedule] });
    expect(runner.schedules.map((scheduled) => scheduled.queue)).toEqual([SWEEP_STORED_FILES_QUEUE]);
  });
});
