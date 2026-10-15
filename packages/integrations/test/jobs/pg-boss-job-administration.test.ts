// What the platform console does with pg-boss's jobs, against the test database: a failed job retried gets one more
// attempt (not a new series of retries), a retry of nothing says so, and the failed list comes a page at a time.
import { randomUUID } from "node:crypto";
import type { DbUrls } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPgBossJobs, type FailedJob, type PgBossJobs } from "../../src/jobs/index.js";

/** Waits until check passes or the time runs out. */
async function eventually(check: () => Promise<boolean> | boolean, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe("pg-boss's job administration", () => {
  const urls: DbUrls = inject("dbUrls");
  const lines: string[] = [];
  let jobs: PgBossJobs;

  beforeAll(async () => {
    jobs = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 3,
      pollingIntervalSeconds: 0.5,
      log: (line) => lines.push(line),
    });
    await jobs.start();
  });

  afterAll(async () => {
    await jobs.stop();
    // Any error pg-boss raised as app_runtime fails the suite.
    expect(lines).toEqual([]);
  });

  async function failedJob(queue: string, id: string): Promise<FailedJob | undefined> {
    return (await jobs.failedJobs({ queue })).find((job) => job.id === id);
  }

  it("gives a failed job one more attempt when retried, and a failing one goes straight back to the list", async () => {
    const runs: number[] = [];
    let fail = true;
    await jobs.work("probe.retried", (job) => {
      runs.push(job.retryCount);
      return fail ? Promise.reject(new Error("not yet")) : Promise.resolve();
    });
    const id = await jobs.send("probe.retried", { eventId: "e9" }, { retryLimit: 0 });
    if (id === null) throw new Error("the job was not queued");
    await eventually(async () => (await failedJob("probe.retried", id)) !== undefined);
    expect(runs).toEqual([0]);

    // One more attempt, the job's second: it fails, and the job is failed again at once, with no backoff series.
    expect(await jobs.retryFailedJob("probe.retried", id)).toBe(true);
    await eventually(async () => (await failedJob("probe.retried", id))?.attempts === 2);
    expect(runs).toEqual([0, 1]);

    fail = false;
    expect(await jobs.retryFailedJob("probe.retried", id)).toBe(true);
    await eventually(() => runs.length === 3);
    expect(runs).toEqual([0, 1, 2]);
    await eventually(async () => (await failedJob("probe.retried", id)) === undefined);
    // Each failed attempt was logged by queue, job id and name.
    expect(lines.splice(0)).toEqual(Array(2).fill(`queue probe.retried, job ${id} failed: Error`));
  });

  it("says when there was nothing to retry: a job that isn't failed, or a queue that doesn't exist", async () => {
    await jobs.work("probe.not-failed", () => Promise.resolve());
    const id = await jobs.send("probe.not-failed", {});
    if (id === null) throw new Error("the job was not queued");
    expect(await jobs.retryFailedJob("probe.not-failed", id)).toBe(false);
    expect(await jobs.retryFailedJob("probe.never-created", randomUUID())).toBe(false);
    await expect(jobs.retryFailedJob("probe.not-failed", "not-a-uuid")).rejects.toThrow(RangeError);
  });

  it("lists one queue's failed jobs a page at a time, newest first, each page after the last one's job", async () => {
    await jobs.work("probe.paged", () => Promise.reject(new Error("always")));
    const ids: string[] = [];
    for (let count = 0; count < 5; count += 1) {
      const id = await jobs.send("probe.paged", { count }, { retryLimit: 0 });
      if (id !== null) ids.push(id);
    }
    await eventually(async () => (await jobs.failedJobs({ queue: "probe.paged" })).length === 5);
    lines.splice(0);

    const pages: FailedJob[][] = [];
    let after: FailedJob | undefined;
    for (;;) {
      const page = await jobs.failedJobs({ queue: "probe.paged", limit: 2, ...(after ? { after } : {}) });
      if (page.length === 0) break;
      pages.push(page);
      after = page.at(-1);
    }
    expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
    const listed = pages.flat();
    expect(listed.map((job) => job.id).sort()).toEqual([...ids].sort());
    expect(listed.every((job) => job.queue === "probe.paged")).toBe(true);
    const times = listed.map((job) => job.failedAt?.getTime() ?? 0);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // The whole list, unfiltered, holds them in the same order.
    const all = (await jobs.failedJobs({ limit: 500 })).filter((job) => job.queue === "probe.paged");
    expect(all.map((job) => job.id)).toEqual(listed.map((job) => job.id));
  });

  it("validates a page's queue and cursor", async () => {
    await expect(jobs.failedJobs({ queue: "Not A Queue" })).rejects.toThrow(RangeError);
    await expect(jobs.failedJobs({ after: { id: "nope", failedAt: null } })).rejects.toThrow(RangeError);
  });
});
