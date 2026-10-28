// pg-boss as the job queue, against the test database: it runs as app_runtime on the schema our migrations created,
// retries with backoff, lists what failed, queues a repeated job id once, and stops gracefully. What goes wrong is
// logged a line each, ids and codes only.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import type { DbUrls } from "@travel-crm/db/testing";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { createPgBossJobs, ownMessage, type PgBossJobs } from "../../src/jobs/index.js";
import { pgBossOptionsOf } from "../../src/jobs/pg-boss-options.js";
import { createMemoryLogger } from "../../src/logging/index.js";
import { describeJobAdapter } from "./job-adapter-contract.js";

/** Waits until check passes or the time runs out. */
async function eventually(check: () => Promise<boolean> | boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describeJobAdapter("pg-boss", async () => {
  const jobs = createPgBossJobs({
    connectionString: inject("dbUrls").runtime,
    maxConnections: 2,
    pollingIntervalSeconds: 0.5,
    // The lines for the contract's failing handler; the stored copies are what it checks.
    logger: createMemoryLogger(),
  });
  await jobs.start();
  return {
    queue: jobs,
    runner: jobs,
    runUntil: (check) => eventually(check, 25_000),
    failed: async () =>
      (await jobs.failedJobs()).map(({ id, queue, attempts, error }) => ({ id, queue, attempts, error })),
    schedules: () => jobs.schedules(),
    stop: () => jobs.stop(),
  };
});

describe("pg-boss's own loops", () => {
  it("hands the scheduled sends' check interval to pg-boss, which holds it to 1 to 45 seconds", () => {
    const settings = { connectionString: "postgresql://nobody@127.0.0.1:9/none" };
    expect(() => createPgBossJobs({ ...settings, cronWorkerIntervalSeconds: 46 })).toThrow(
      /cronWorkerIntervalSeconds must be between 1 and 45 seconds/,
    );
    expect(() => createPgBossJobs({ ...settings, cronWorkerIntervalSeconds: 45 })).not.toThrow();
  });

  it("starts a send-only instance with no supervision, no schedules and its queue cache read once a day", () => {
    const settings = { connectionString: "postgresql://nobody@127.0.0.1:9/none" };
    expect(pgBossOptionsOf({ ...settings, sendOnly: true })).toMatchObject({
      supervise: false,
      schedule: false,
      queueCacheIntervalSeconds: 86_400,
    });
    // pg-boss accepts the longest queue cache interval it allows.
    expect(() => createPgBossJobs({ ...settings, sendOnly: true })).not.toThrow();
    // Every other instance keeps pg-boss's own loops.
    const working = pgBossOptionsOf(settings);
    for (const loop of ["supervise", "schedule", "queueCacheIntervalSeconds"]) {
      expect(working, loop).not.toHaveProperty(loop);
    }
  });
});

describe("pg-boss jobs", () => {
  const urls: DbUrls = inject("dbUrls");
  // Uncensored: the lines are exactly what the adapter passed, so these tests are the adapter's contract with the privacy
  // rule (ids, codes, counts and timings only), not a check of the censor.
  const logger = createMemoryLogger({ censor: false });
  /** What went wrong: pg-boss's own warnings and errors, and failing jobs. */
  const problems = () => logger.entries.filter((entry) => entry.level === "warn" || entry.level === "error");
  let jobs: PgBossJobs;
  let db: Database;

  beforeAll(async () => {
    jobs = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 3,
      pollingIntervalSeconds: 0.5,
      logger,
    });
    await jobs.start();
    db = createDatabase(urls.runtime, { maxConnections: 1 });
  });

  afterAll(async () => {
    await jobs.stop();
    await db.disconnect();
    // Any error pg-boss raised as app_runtime (a missing grant, say) fails the suite.
    expect(problems()).toEqual([]);
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
      return Promise.reject(ownMessage(new Error(`attempt ${String(job.retryCount + 1)} failed`)));
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
    // Each failed attempt was logged by queue, job id, retry count and the error's name; take them out of the suite's
    // check for pg-boss's own.
    expect(problems().map((entry) => [entry.msg, entry.queue, entry.jobId, entry.retryCount, entry.errorName])).toEqual(
      [0, 1, 2].map((retryCount) => ["job failed", "probe.failing", id, retryCount, "Error"]),
    );
    logger.entries.length = 0;
  });

  it("logs each job's start at debug and its end at info, with its queue, id, organization and duration", async () => {
    const organizationId = randomUUID();
    let done = false;
    await jobs.work("probe.lines", () => {
      done = true;
      return Promise.resolve();
    });
    const id = await jobs.send("probe.lines", { organizationId, eventId: "e-lines", email: "jane.doe@example.com" });
    await eventually(() => done);
    await eventually(() => logger.entries.some((entry) => entry.msg === "job finished" && entry.jobId === id));
    const lines = logger.entries.filter((entry) => entry.jobId === id);
    expect(lines.map((entry) => [entry.level, entry.msg])).toEqual([
      ["debug", "job started"],
      ["info", "job finished"],
    ]);
    expect(lines[1]).toMatchObject({ queue: "probe.lines", organizationId, retryCount: 0, outcome: "done" });
    expect(typeof lines[1]?.durationMs).toBe("number");
    // Proven: the start line and the end line carry these keys and no others, so nothing of the job's data (its event
    // id, the email it holds) is in them.
    expect(Object.keys(lines[0] ?? {}).sort()).toEqual([
      "jobId",
      "level",
      "msg",
      "organizationId",
      "queue",
      "retryCount",
    ]);
    expect(Object.keys(lines[1] ?? {}).sort()).toEqual([
      "durationMs",
      "jobId",
      "level",
      "msg",
      "organizationId",
      "outcome",
      "queue",
      "retryCount",
    ]);
    expect(JSON.stringify(lines)).not.toMatch(/jane|e-lines/);
    logger.entries.length = 0;
  });

  it("logs a failing job with its name, code, cause and frames, and no message", async () => {
    let failed = false;
    await jobs.work("probe.contract-fail", () => {
      failed = true;
      return Promise.reject(Object.assign(new Error("no mailbox for jane.doe@example.com"), { code: "EENVELOPE" }));
    });
    const id = await jobs.send("probe.contract-fail", { eventId: "e-contract" }, { retryLimit: 0 });
    await eventually(() => failed);
    await eventually(() => logger.entries.some((entry) => entry.msg === "job failed" && entry.jobId === id));
    const line = logger.entries.find((entry) => entry.msg === "job failed" && entry.jobId === id);
    // Proven: a failed job's line has the job's identity and the error's name, code and frames, and no message.
    expect(Object.keys(line ?? {}).sort()).toEqual([
      "durationMs",
      "errorCode",
      "errorName",
      "errorStack",
      "jobId",
      "level",
      "msg",
      "outcome",
      "queue",
      "retryCount",
    ]);
    expect(JSON.stringify(line)).not.toMatch(/jane|mailbox/);
    logger.entries.length = 0;
  });

  it("queues a repeated job id once", async () => {
    const id = randomUUID();
    expect(await jobs.send("probe.once", { eventId: "e3" }, { id })).toBe(id);
    expect(await jobs.send("probe.once", { eventId: "e3" }, { id })).toBeNull();
  });

  it("keeps a schedule with its time zone, owing one run for what came due while nothing ran, and removes it", async () => {
    await jobs.schedule("probe.nightly", "30 2 * * *", { timeZone: "Asia/Kolkata", data: { reason: "nightly" } });
    expect(await jobs.schedules()).toContainEqual({
      queue: "probe.nightly",
      cron: "30 2 * * *",
      timeZone: "Asia/Kolkata",
    });
    // A worker stopped overnight sends the night's run once when it starts again (pg-boss's `missed: 'once'`).
    const rows = await db.withoutOrg(
      (tx) => tx.$queryRaw<{ missed: string | null }[]>`
        SELECT options ->> 'missed' AS missed FROM pgboss.schedule WHERE name = 'probe.nightly'`,
    );
    expect(rows).toEqual([{ missed: "once" }]);
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

  it("gives a job the time to run it asks for, up to pg-boss's 24 hours, before its attempt counts as failed", async () => {
    const id = await jobs.send(
      "probe.long",
      {},
      { expireInSeconds: 2 * 60 * 60, startAfter: new Date(Date.now() + 3_600_000) },
    );
    const rows = await db.withoutOrg(
      (tx) => tx.$queryRaw<{ expire_seconds: number }[]>`SELECT expire_seconds FROM pgboss.job WHERE id = ${id}::uuid`,
    );
    expect(rows).toEqual([{ expire_seconds: 7200 }]);
    for (const expireInSeconds of [0, 1.5, 24 * 60 * 60 + 1]) {
      await expect(jobs.send("probe.long", {}, { expireInSeconds }), String(expireInSeconds)).rejects.toThrow(
        RangeError,
      );
    }
  });

  it("stores only a sanitised error, and logs only names: no personal data, cause, detail or stack", async () => {
    const reported = createMemoryLogger();
    const sanitising = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 2,
      pollingIntervalSeconds: 0.5,
      logger: reported,
    });
    await sanitising.start();
    try {
      const original = Object.assign(
        ownMessage(
          new Error("no mailbox for jane.doe@example.com, call 9876543210", { cause: new Error("secret cause") }),
        ),
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
      const failures = reported.entries.filter((entry) => entry.level === "error");
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        msg: "job failed",
        queue: "probe.sanitised",
        jobId: id,
        errorName: "Error",
        errorCause: "Error",
      });
      expect(JSON.stringify(reported.entries)).not.toMatch(/jane|secret cause|9876543210|detail/);
    } finally {
      await sanitising.stop();
    }
  });

  it("stores the sanitised error even when the log throws", async () => {
    const throwing = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 2,
      pollingIntervalSeconds: 0.5,
      logger: {
        child: () => {
          throw new Error("the logger is broken");
        },
        debug: () => {
          throw new Error("the logger is broken");
        },
        info: () => {
          throw new Error("the logger is broken");
        },
        warn: () => {
          throw new Error("the logger is broken");
        },
        error: () => {
          throw new Error("the logger is broken");
        },
      },
    });
    await throwing.start();
    try {
      await throwing.work("probe.logger-broken", () => Promise.reject(new Error("boom for jane@example.com")));
      const id = await throwing.send("probe.logger-broken", {}, { retryLimit: 0 });
      await eventually(async () => (await throwing.failedJobs()).some((job) => job.id === id));
      expect((await throwing.failedJobs()).find((job) => job.id === id)?.error).toBe("Error");
    } finally {
      await throwing.stop();
    }
  });

  it("stores a library's error by its name only: a Prisma validation error keeps none of the data it quotes", async () => {
    const leaky = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 2,
      pollingIntervalSeconds: 0.5,
      logger: createMemoryLogger(),
    });
    await leaky.start();
    try {
      // Prisma quotes the query's values in a validation error's message: here a person's name, email and phone.
      const person = "Jane Doe, jane.doe@example.com, +91 98765 43210";
      await leaky.work("probe.prisma-leak", async () => {
        await db.forOrg(randomUUID(), (tx) =>
          tx.notification.create({
            data: { recipientUserId: randomUUID(), kind: "probe.leak", title: person, body: 42 } as never,
          }),
        );
      });
      const id = await leaky.send("probe.prisma-leak", {}, { retryLimit: 0 });
      await eventually(async () => (await leaky.failedJobs()).some((job) => job.id === id));
      const [row] = await db.withoutOrg(
        (tx) =>
          tx.$queryRaw<{ output: string }[]>`SELECT output::text AS output FROM pgboss.job WHERE id = ${id}::uuid`,
      );
      expect(row?.output).toContain("PrismaClientValidationError");
      expect(row?.output).not.toMatch(/Jane Doe|jane\.doe|98765/);
    } finally {
      await leaky.stop();
    }
  });

  it("lists failed jobs without the one whose data is malformed, and reports it", async () => {
    const reported = createMemoryLogger();
    const listing = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 2,
      pollingIntervalSeconds: 0.5,
      logger: reported,
    });
    await listing.start();
    try {
      await listing.work("probe.malformed", () => Promise.resolve());
      const bad = await listing.send("probe.malformed", [1, 2] as never, { retryLimit: 0 });
      const good = await listing.send("probe.malformed", { eventId: "e9" }, { retryLimit: 0 });
      await listing.work("probe.malformed-good", () => Promise.reject(new Error("boom")));
      const other = await listing.send("probe.malformed-good", { eventId: "e10" }, { retryLimit: 0 });
      // Wait until pg-boss has failed both the malformed job and the healthy failing one.
      await eventually(async () => {
        const rows = await db.withoutOrg(
          (tx) => tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM pgboss.job WHERE state = 'failed' AND id IN (${bad}::uuid, ${other}::uuid)`,
        );
        return rows.length === 2;
      });

      const ids = (await listing.failedJobs()).map((job) => job.id);
      expect(ids).toContain(other);
      expect(ids).not.toContain(bad);
      expect(ids).not.toContain(good);
      expect(reported.entries).toContainEqual(
        expect.objectContaining({
          level: "warn",
          msg: "A failed job can't be listed",
          jobId: bad,
          queue: "probe.malformed",
          errorName: "TypeError",
        }),
      );
    } finally {
      await listing.stop();
      // The malformed job is not left in the shared job table, where a list of every failed job would report it again.
      await db.withoutOrg(
        (tx) => tx.$executeRaw`DELETE FROM pgboss.job WHERE name IN ('probe.malformed', 'probe.malformed-good')`,
      );
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

  it("logs pg-boss's own errors by name, code and queue, never the message", () => {
    const on = vi.spyOn(PgBoss.prototype, "on");
    const logged = createMemoryLogger();
    createPgBossJobs({ connectionString: urls.runtime, logger: logged });
    const errorListeners = on.mock.calls.flatMap(([event, listener]) =>
      event === "error" ? [listener as (error: unknown) => void] : [],
    );
    on.mockRestore();
    expect(errorListeners).toHaveLength(1);
    // What pg-boss emits when a worker's fetch fails: the error spread into a plain object, with the queue.
    errorListeners[0]?.({
      message: "lost the connection while mailing jane.doe@example.com",
      stack: "Error: lost the connection while mailing jane.doe@example.com",
      code: "57P01",
      queue: "probe.events",
      worker: "w1",
    });
    errorListeners[0]?.(new Error("maintenance failed for jane.doe@example.com", { cause: new Error("jane.doe") }));
    expect(logged.entries).toMatchObject([
      {
        level: "error",
        msg: "pg-boss error",
        source: "pg-boss",
        queue: "probe.events",
        errorName: "Error",
        errorCode: "57P01",
      },
      { level: "error", msg: "pg-boss error", source: "pg-boss", errorName: "Error", errorCause: "Error" },
    ]);
    expect(JSON.stringify(logged.entries)).not.toMatch(/jane/);
  });

  it("waits for a running handler when it stops", async () => {
    const stopped = createMemoryLogger();
    const stopping = createPgBossJobs({
      connectionString: urls.runtime,
      maxConnections: 2,
      pollingIntervalSeconds: 0.5,
      logger: stopped,
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
      expect(stopped.entries.filter((entry) => entry.level === "warn" || entry.level === "error")).toEqual([]);
    } finally {
      await stopping.stop().catch(() => undefined);
    }
  });
});
