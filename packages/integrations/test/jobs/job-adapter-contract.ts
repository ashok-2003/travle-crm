// The behaviour both job adapters share, run against each one: the in-memory twin the domain's tests use is proven to
// act like pg-boss where they rely on it. Where it can't (time, concurrency, logging), the package README says how.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JobData, JobQueue, JobRunner } from "../../src/jobs/index.js";

/** A job that used all its retries, as either adapter lists it. */
export interface ListedFailure {
  id: string;
  queue: string;
  attempts: number;
  error: string;
}

export interface JobsUnderTest {
  queue: JobQueue;
  runner: JobRunner;
  /** Lets queued jobs run until check passes: the memory runner runs them at once, pg-boss is polled. */
  runUntil(check: () => boolean | Promise<boolean>): Promise<void>;
  failed(): Promise<ListedFailure[]>;
  schedules(): Promise<{ queue: string; cron: string; timeZone: string }[]>;
  stop(): Promise<void>;
}

/** Every adapter's test calls this once, with a way to start the adapter. */
export function describeJobAdapter(name: string, start: () => Promise<JobsUnderTest>): void {
  describe(`${name}: the jobs port`, () => {
    let subject: JobsUnderTest;

    beforeAll(async () => {
      subject = await start();
    });

    afterAll(async () => {
      await subject.stop();
    });

    it("delivers a job's data to its own queue's handler", async () => {
      const seen: { queue: string; data: JobData }[] = [];
      for (const queue of ["contract.delivered", "contract.not-delivered"]) {
        await subject.runner.work(queue, (job) => {
          seen.push({ queue, data: job.data });
          return Promise.resolve();
        });
      }
      await subject.queue.send("contract.delivered", { organizationId: "o1", count: 2, urgent: true, note: null });
      await subject.runUntil(() => seen.length === 1);
      expect(seen).toEqual([
        { queue: "contract.delivered", data: { organizationId: "o1", count: 2, urgent: true, note: null } },
      ]);
    });

    it("retries a failing job up to its retry limit, then lists it as failed with a cut-down error", async () => {
      const tries: number[] = [];
      await subject.runner.work("contract.failing", (job) => {
        tries.push(job.retryCount);
        return Promise.reject(new Error(`no mailbox for jane@example.com, try ${String(job.retryCount)}`));
      });
      const id = await subject.queue.send("contract.failing", {}, { retryLimit: 2, retryDelaySeconds: 1 });
      await subject.runUntil(async () => (await subject.failed()).some((job) => job.id === id));
      expect(tries).toEqual([0, 1, 2]);
      expect((await subject.failed()).find((job) => job.id === id)).toEqual({
        id,
        queue: "contract.failing",
        attempts: 3,
        error: "Error: no mailbox for [email], try 2",
      });
    });

    it("queues a repeated job id once on its queue, and again on another queue", async () => {
      const id = randomUUID();
      expect(await subject.queue.send("contract.once", {}, { id })).toBe(id);
      expect(await subject.queue.send("contract.once", {}, { id })).toBeNull();
      expect(await subject.queue.send("contract.once-elsewhere", {}, { id })).toBe(id);
    });

    it("refuses a job id that is not a UUID", async () => {
      await expect(subject.queue.send("contract.once", {}, { id: "job-1" })).rejects.toThrow(RangeError);
    });

    it("refuses queue names that aren't <module>.<action>, wherever one is named", async () => {
      await expect(subject.queue.send("RenderPdf", {})).rejects.toThrow(/Queue names/);
      await expect(subject.runner.work("RenderPdf", () => Promise.resolve())).rejects.toThrow(/Queue names/);
      await expect(subject.runner.schedule("RenderPdf", "0 3 * * *", { timeZone: "Asia/Kolkata" })).rejects.toThrow(
        /Queue names/,
      );
      await expect(subject.runner.unschedule("RenderPdf")).rejects.toThrow(/Queue names/);
    });

    it("keeps one schedule per queue, in its time zone, until it is removed", async () => {
      const nightly = async () =>
        (await subject.schedules()).filter((schedule) => schedule.queue === "contract.nightly");
      await subject.runner.schedule("contract.nightly", "30 2 * * *", { timeZone: "Asia/Kolkata" });
      await subject.runner.schedule("contract.nightly", "45 3 * * *", { timeZone: "Asia/Kolkata", data: { days: 1 } });
      expect(await nightly()).toEqual([{ queue: "contract.nightly", cron: "45 3 * * *", timeZone: "Asia/Kolkata" }]);
      await subject.runner.unschedule("contract.nightly");
      expect(await nightly()).toEqual([]);
    });

    it("refuses a schedule in an unknown time zone", async () => {
      await expect(
        subject.runner.schedule("contract.zoned", "0 3 * * *", { timeZone: "Mars/Olympus_Mons" }),
      ).rejects.toThrow(/time zone/i);
    });
  });
}
