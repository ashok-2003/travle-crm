// The in-memory runner behaves like pg-boss where the worker's tests rely on it: handlers get queued jobs, failures
// are retried up to the job's limit and then recorded, and schedules are kept with their time zone.
import { describe, expect, it } from "vitest";
import { createMemoryJobQueue, createMemoryJobRunner } from "../../src/jobs/index.js";
import { describeJobAdapter } from "./job-adapter-contract.js";

describeJobAdapter("memory", () => {
  const queue = createMemoryJobQueue();
  const runner = createMemoryJobRunner(queue);
  return Promise.resolve({
    queue,
    runner,
    runUntil: async (check) => {
      await runner.runQueued();
      if (!(await check())) throw new Error("Every queued job ran, and the check still fails");
    },
    failed: () =>
      Promise.resolve(
        runner.failed.map(({ job, attempts, error }) => ({ id: job.id, queue: job.queue, attempts, error })),
      ),
    schedules: () =>
      Promise.resolve(runner.schedules.map(({ queue: name, cron, timeZone }) => ({ queue: name, cron, timeZone }))),
    stop: () => Promise.resolve(),
  });
});

describe("memory job runner", () => {
  it("runs queued jobs that have a handler, including jobs the handlers queue", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const seen: string[] = [];
    await runner.work("documents.render-pdf", async (job) => {
      seen.push(String(job.data.documentId));
      if (job.data.documentId === "d1") await queue.send("documents.render-pdf", { documentId: "d2" });
    });
    await queue.send("documents.render-pdf", { documentId: "d1" });
    await queue.send("webhooks.process", { webhookEventId: "w1" });

    expect(await runner.runQueued()).toBe(2);
    expect(seen).toEqual(["d1", "d2"]);
    expect(await runner.runQueued()).toBe(0);
  });

  it("retries a failing job up to its limit, then records it as failed", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const attempts: number[] = [];
    await runner.work("notifications.deliver", (job) => {
      attempts.push(job.retryCount);
      return Promise.reject(new Error("mail server down"));
    });
    await queue.send("notifications.deliver", { notificationId: "n1" }, { retryLimit: 2 });

    await runner.runQueued();
    expect(attempts).toEqual([0, 1, 2]);
    expect(runner.failed).toMatchObject([
      { attempts: 3, error: "Error: mail server down", job: { queue: "notifications.deliver" } },
    ]);
  });

  it("keeps schedules with their time zone, and fires them on demand", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    await runner.schedule("rate-limits.purge", "15 3 * * *", { timeZone: "Asia/Kolkata", data: { days: 1 } });
    expect(runner.schedules).toEqual([
      { queue: "rate-limits.purge", cron: "15 3 * * *", timeZone: "Asia/Kolkata", data: { days: 1 } },
    ]);
    await runner.fireSchedule("rate-limits.purge");
    expect(queue.sent).toMatchObject([{ queue: "rate-limits.purge", data: { days: 1 } }]);
    await runner.unschedule("rate-limits.purge");
    expect(runner.schedules).toEqual([]);
  });
});
