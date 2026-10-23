// The worker runs the Meta lead ads only when Meta is set up: its listeners (the route, the attention notice, Check now, the
// catch-up of a form's skipped leads, the import of earlier leads and its matching), the catch-up job, the dispatcher every
// minute and the daily health check. Without it, none of them (ADR 0034).
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { describe, expect, it } from "vitest";
import { aMeta } from "./support/meta.js";
import { workerJobs, type WorkerJobDependencies } from "../src/worker-jobs.js";

const unused = {} as never;
const identity = {
  inviteListener: () => ({ name: "identity.send-invite", eventType: "staff.invited", handle: () => Promise.resolve() }),
} as unknown as WorkerJobDependencies["identity"];
const base: WorkerJobDependencies = {
  db: unused,
  identity,
  files: unused,
  spreadsheets: unused,
  subscriptions: unused,
  seatLimit: unused,
  email: unused,
  push: unused,
  appUrl: "https://app.example.in",
  webhookProviders: [],
  rateLimiter: unused,
  logger: createMemoryLogger(),
  jobs: createMemoryJobQueue(),
};
const meta = aMeta({ db: unused, identity: unused, subscriptions: unused, logger: createMemoryLogger() }).services;

describe("the worker's Meta lead ads work", () => {
  const listeners = [
    "meta.update-route",
    "meta.notify-attention",
    "meta.check-now",
    "meta.catch-up-form",
    "meta.earlier-leads",
    "meta.match-import",
  ];

  it("runs the listeners, the catch-up job, the dispatcher and the health check when Meta is set up", () => {
    const jobs = workerJobs({ ...base, meta });
    const names = jobs.listeners.map((listener) => listener.name);
    for (const name of listeners) expect(names, name).toContain(name);
    expect(jobs.handlers.map((handler) => handler.queue)).toContain("meta.catchup");
    expect(jobs.schedules.find((schedule) => schedule.queue === "meta.dispatch-catchups")).toMatchObject({
      cron: "* * * * *",
    });
    expect(jobs.schedules.find((schedule) => schedule.queue === "meta.health")).toMatchObject({
      cron: "10 4 * * *",
      timeZone: "Asia/Kolkata",
    });
  });

  it("runs none of it without Meta, and no listener, queue or schedule is named twice with it", () => {
    for (const without of [workerJobs(base), workerJobs({ ...base, meta: null })]) {
      const names = without.listeners.map((listener) => listener.name);
      for (const name of listeners) expect(names, name).not.toContain(name);
      expect(without.handlers.map((handler) => handler.queue)).not.toContain("meta.catchup");
      expect(without.schedules.map((schedule) => schedule.queue)).not.toContain("meta.dispatch-catchups");
    }
    const withMeta = workerJobs({ ...base, meta });
    const all = [
      ...withMeta.listeners.map((listener) => listener.name),
      ...withMeta.handlers.map((handler) => handler.queue),
      ...withMeta.schedules.map((schedule) => schedule.queue),
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it("does not schedule the dispatcher without a job queue to send to", () => {
    const withoutQueue: Partial<WorkerJobDependencies> = { ...base };
    delete withoutQueue.jobs;
    const jobs = workerJobs({ ...(withoutQueue as WorkerJobDependencies), meta });
    expect(jobs.schedules.map((schedule) => schedule.queue)).not.toContain("meta.dispatch-catchups");
  });
});
