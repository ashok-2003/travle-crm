// The failed-jobs list (spec 9.1) in the console: newest first a page at a time, one more attempt for a failed job and
// a schedule removed, each in the platform log; nothing logged for a job that wasn't there; and the platform's purge,
// erasure and export never retried, as a super admin asks for them again instead.
import type { FailedJob } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ERASE_SUBJECT_QUEUE,
  EXPORT_ORGANIZATION_QUEUE,
  listFailedJobs,
  listPlatformLog,
  listSchedules,
  PURGE_ORGANIZATION_QUEUE,
  removeSchedule,
  retryFailedJob,
} from "../../src/platform/index.js";
import { createTestPlatform, support, type TestPlatform } from "./test-platform.js";

/** A failed job on `queue`, failed `minutesAgo` minutes ago (or at no recorded time). */
function failed(queue: string, id: string, minutesAgo: number | null): FailedJob {
  return {
    id,
    queue,
    data: { organizationId: "0199e7a0-0000-7000-8000-0000000000fb" },
    attempts: 6,
    failedAt: minutesAgo === null ? null : new Date(Date.now() - minutesAgo * 60_000),
    error: "Error: failed",
  };
}

const jobId = (n: number) => `0199e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`;

describe("the failed-jobs list", () => {
  let test: TestPlatform;

  beforeAll(() => {
    test = createTestPlatform();
  });

  afterAll(async () => {
    await test.close();
  });

  /** This test's entries: other test files write the platform log at the same time. */
  async function logAbout(targetIds: string[]) {
    const log = await test.services.platformDb.transaction((tx) => listPlatformLog(tx, { limit: 100 }));
    return log.entries.filter((entry) => targetIds.includes(entry.targetId)).map((entry) => entry.action);
  }

  it("lists failed jobs, runs one again, and removes a leftover schedule, each in the platform log", async () => {
    test.jobs.failed.push(failed("documents.render-pdf", jobId(250), 5));
    test.jobs.scheduled.push({ queue: "reports.weekly-digest", cron: "0 8 * * 1", timeZone: "Asia/Kolkata" });
    const page = await listFailedJobs(test.services, { limit: 50, queue: "documents.render-pdf" });
    expect(page).toEqual({
      jobs: [expect.objectContaining({ id: jobId(250), attempts: 6, failedAt: expect.any(String) as string })],
      nextCursor: null,
    });
    await retryFailedJob(test.services, support, { queue: "documents.render-pdf", jobId: jobId(250) });
    expect(test.jobs.retried).toEqual([{ queue: "documents.render-pdf", jobId: jobId(250) }]);
    await removeSchedule(test.services, support, "reports.weekly-digest");
    expect(await listSchedules(test.services)).toEqual([]);
    expect(await logAbout(["reports.weekly-digest", jobId(250)])).toEqual(["schedule.removed", "job.retried"]);
  });

  it("comes a page at a time, newest first, each page after the last one's job", async () => {
    // Two failed at the same moment (the id breaks the tie), and one without a time, which comes last.
    const same = new Date(Date.now() - 2 * 60_000);
    test.jobs.failed.push(
      failed("probe.paged", jobId(1), 9),
      { ...failed("probe.paged", jobId(2), null), failedAt: same },
      failed("probe.paged", jobId(3), null),
      { ...failed("probe.paged", jobId(4), null), failedAt: same },
      failed("probe.paged", jobId(5), 1),
      failed("probe.other", jobId(6), 0),
    );
    const pages: string[][] = [];
    let after: { failedAt: string | null; id: string } | undefined;
    for (;;) {
      const page = await listFailedJobs(test.services, { limit: 2, queue: "probe.paged", ...(after ? { after } : {}) });
      pages.push(page.jobs.map((job) => job.id));
      if (!page.nextCursor) break;
      after = page.nextCursor;
    }
    expect(pages).toEqual([[jobId(5), jobId(4)], [jobId(2), jobId(1)], [jobId(3)]]);
  });

  it("logs nothing, and says so, when the job isn't failed (any more)", async () => {
    await expect(
      retryFailedJob(test.services, support, { queue: "documents.render-pdf", jobId: jobId(404) }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", reason: "FAILED_JOB_NOT_FOUND" });
    expect(await logAbout([jobId(404)])).toEqual([]);
  });

  it("retries the platform's cleanups, which only finish what a committed purge, erasure or expiry began", async () => {
    // Fixer D's deletions' outbox, and the export's expiry.
    const queues = ["platform.delete-stored-files", "platform.expire-exports"];
    queues.forEach((queue, index) => test.jobs.failed.push(failed(queue, jobId(900 + index), 1)));
    for (const [index, queue] of queues.entries()) {
      await retryFailedJob(test.services, support, { queue, jobId: jobId(900 + index) });
    }
    expect(test.jobs.retried.filter((job) => queues.includes(job.queue)).map((job) => job.queue)).toEqual(queues);
    expect(await logAbout(queues.map((_, index) => jobId(900 + index)))).toEqual(["job.retried", "job.retried"]);
  });

  it("never retries a purge, an erasure or an export: a super admin asks for it again, so every check runs", async () => {
    const queues = [PURGE_ORGANIZATION_QUEUE, ERASE_SUBJECT_QUEUE, EXPORT_ORGANIZATION_QUEUE];
    queues.forEach((queue, index) => test.jobs.failed.push(failed(queue, jobId(700 + index), 1)));
    for (const [index, queue] of queues.entries()) {
      await expect(
        retryFailedJob(test.services, support, { queue, jobId: jobId(700 + index) }),
        queue,
      ).rejects.toMatchObject({ code: "CONFLICT", reason: "NOT_RETRYABLE" });
    }
    // Still in the list, never run again, and nothing logged.
    expect(test.jobs.failed.filter((job) => queues.includes(job.queue))).toHaveLength(3);
    expect(test.jobs.retried.filter((job) => queues.includes(job.queue))).toEqual([]);
    expect(await logAbout(queues.map((_, index) => jobId(700 + index)))).toEqual([]);
  });
});
