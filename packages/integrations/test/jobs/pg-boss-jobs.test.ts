// pg-boss as the job queue, against the test database: it runs as app_runtime on the schema our migrations created,
// retries with backoff, lists what failed, queues a repeated job id once, and stops gracefully.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import type { DbUrls } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPgBossJobs, type PgBossJobs } from "../../src/jobs/index.js";

/** Waits until check passes or the time runs out. */
async function eventually(check: () => Promise<boolean> | boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe("pg-boss jobs", () => {
  const urls: DbUrls = inject("dbUrls");
  const errors: Error[] = [];
  let jobs: PgBossJobs;
  let db: Database;

  beforeAll(async () => {
    jobs = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 3,
      pollingIntervalSeconds: 0.5,
      onError: (error) => errors.push(error),
    });
    await jobs.start();
    db = createDatabase(urls.runtime, { maxConnections: 1 });
  });

  afterAll(async () => {
    await jobs.stop();
    await db.disconnect();
    // Any error pg-boss raised as app_runtime (a missing grant, say) fails the suite.
    expect(errors).toEqual([]);
  });

  it("delivers a job's data to its queue's handler", async () => {
    const seen: unknown[] = [];
    await jobs.work("probe.delivered", (job) => {
      seen.push(job.data);
      return Promise.resolve();
    });
    await jobs.send("probe.delivered", { organizationId: "o1", eventId: "e1" });
    await eventually(() => seen.length === 1);
    expect(seen).toEqual([{ organizationId: "o1", eventId: "e1" }]);
  });

  it("retries a failing job with backoff, then lists it as failed with its error", async () => {
    const tries: number[] = [];
    const triedAt: number[] = [];
    await jobs.work("probe.failing", (job) => {
      tries.push(job.retryCount);
      triedAt.push(Date.now());
      return Promise.reject(new Error(`attempt ${String(job.retryCount + 1)} failed`));
    });
    const id = await jobs.send("probe.failing", { eventId: "e2" }, { retryLimit: 2, retryDelaySeconds: 1 });

    await eventually(async () => (await jobs.failedJobs()).some((job) => job.id === id), 25_000);
    expect(tries).toEqual([0, 1, 2]);
    // Backoff: each retry waits at least the one second asked for.
    const gaps = triedAt.slice(1).map((time, index) => time - (triedAt[index] ?? 0));
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(900);
    const failed = (await jobs.failedJobs()).find((job) => job.id === id);
    expect(failed).toMatchObject({
      queue: "probe.failing",
      data: { eventId: "e2" },
      attempts: 3,
      error: "Error: attempt 3 failed",
    });
    expect(failed?.failedAt).toBeInstanceOf(Date);
    // Each failed attempt's original error went to onError; take them out of the suite's check for pg-boss's own.
    expect(errors.splice(0).map((error) => error.message)).toEqual([
      "attempt 1 failed",
      "attempt 2 failed",
      "attempt 3 failed",
    ]);
  });

  it("queues a repeated job id once", async () => {
    const id = randomUUID();
    expect(await jobs.send("probe.once", { eventId: "e3" }, { id })).toBe(id);
    expect(await jobs.send("probe.once", { eventId: "e3" }, { id })).toBeNull();
  });

  it("keeps a schedule with its time zone, and removes it", async () => {
    await jobs.schedule("probe.nightly", "30 2 * * *", { timeZone: "Asia/Kolkata", data: { reason: "nightly" } });
    expect(await jobs.schedules()).toContainEqual({
      queue: "probe.nightly",
      cron: "30 2 * * *",
      timeZone: "Asia/Kolkata",
    });
    await jobs.unschedule("probe.nightly");
    expect((await jobs.schedules()).map((schedule) => schedule.queue)).not.toContain("probe.nightly");
  });

  it("creates queues with the default retry policy", async () => {
    await jobs.send("probe.policy", {});
    const rows = await db.withoutOrg(
      (tx) => tx.$queryRaw<Record<string, unknown>[]>`
        SELECT retry_limit, retry_delay, retry_backoff, retry_delay_max FROM pgboss.queue WHERE name = 'probe.policy'`,
    );
    expect(rows).toEqual([{ retry_limit: 5, retry_delay: 10, retry_backoff: true, retry_delay_max: 3600 }]);
  });

  it("stores only a sanitised error: no personal data, cause, detail or stack", async () => {
    const reported: Error[] = [];
    const sanitising = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 2,
      pollingIntervalSeconds: 0.5,
      onError: (error) => reported.push(error),
    });
    await sanitising.start();
    try {
      const original = Object.assign(
        new Error("no mailbox for jane.doe@example.com, call 9876543210", { cause: new Error("secret cause") }),
        { detail: "Key (email)=(jane.doe@example.com) already exists." },
      );
      await sanitising.work("probe.sanitised", () => Promise.reject(original));
      const id = await sanitising.send("probe.sanitised", {}, { retryLimit: 0 });
      await eventually(async () => (await sanitising.failedJobs()).some((job) => job.id === id));

      expect((await sanitising.failedJobs()).find((job) => job.id === id)?.error).toBe(
        "Error: no mailbox for [email], call [number]",
      );
      const [row] = await db.withoutOrg(
        (tx) =>
          tx.$queryRaw<{ output: string }[]>`SELECT output::text AS output FROM pgboss.job WHERE id = ${id}::uuid`,
      );
      expect(row?.output).not.toMatch(/jane\.doe|secret cause|9876543210|detail/);
      expect(Object.keys(JSON.parse(row?.output ?? "{}") as object).sort()).toEqual(["message", "name", "stack"]);
      expect(reported).toEqual([original]);
    } finally {
      await sanitising.stop();
    }
  });

  it("lists failed jobs without the one whose data is malformed, and reports it", async () => {
    const reported: Error[] = [];
    const listing = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 2,
      pollingIntervalSeconds: 0.5,
      onError: (error) => reported.push(error),
    });
    await listing.start();
    try {
      await listing.work("probe.malformed", () => Promise.resolve());
      const bad = await listing.send("probe.malformed", [1, 2] as never, { retryLimit: 0 });
      const good = await listing.send("probe.malformed", { eventId: "e9" }, { retryLimit: 0 });
      await listing.work("probe.malformed-good", () => Promise.reject(new Error("boom")));
      const other = await listing.send("probe.malformed-good", { eventId: "e10" }, { retryLimit: 0 });
      await eventually(async () => (await listing.failedJobs()).some((job) => job.id === other));

      const ids = (await listing.failedJobs()).map((job) => job.id);
      expect(ids).not.toContain(bad);
      expect(ids).not.toContain(good);
      expect(reported.map((error) => error.message).join("\n")).toMatch(/not a plain object|not a string/);
    } finally {
      await listing.stop();
    }
  });

  it("validates the limit of failedJobs", async () => {
    await expect(jobs.failedJobs({ limit: 0 })).rejects.toThrow(RangeError);
    await expect(jobs.failedJobs({ limit: 501 })).rejects.toThrow(RangeError);
    await expect(jobs.failedJobs({ limit: 1.5 })).rejects.toThrow(RangeError);
  });

  it("refuses queue names that aren't <module>.<action>", async () => {
    await expect(jobs.send("RenderPdf", {})).rejects.toThrow(/Queue names/);
  });

  it("waits for a running handler when it stops", async () => {
    const stopErrors: Error[] = [];
    const stopping = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 2,
      pollingIntervalSeconds: 0.5,
      onError: (error) => stopErrors.push(error),
    });
    await stopping.start();
    try {
      let started = false;
      let finished = false;
      await stopping.work("probe.slow", async () => {
        started = true;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        finished = true;
      });
      await stopping.send("probe.slow", {});
      await eventually(() => started);
      await stopping.stop();
      expect(finished).toBe(true);
      expect(stopErrors).toEqual([]);
    } finally {
      await stopping.stop().catch(() => undefined);
    }
  });
});
