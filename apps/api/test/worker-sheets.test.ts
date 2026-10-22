// The worker runs the Google Sheets sync only when Google is set up: its listeners (the baseline, the connect-time import's
// matching, the schedule, the attention notice, Sync now's check), the check job at four at a time, and the dispatcher
// every minute. Without it, none of them (ADR 0031).
import { createMemoryGoogleSheets } from "@travel-crm/integrations/google-sheets";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { createSheetsHashes } from "@travel-crm/domain/sheets";
import { describe, expect, it } from "vitest";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { workerJobs, type WorkerJobDependencies } from "../src/worker-jobs.js";

const unused = {} as never;
/** Only what building the worker's jobs asks of identity: the invite listener. */
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
};

describe("the worker's Google Sheets work", () => {
  const sheetsListeners = [
    "sheets.baseline",
    "sheets.match-import",
    "sheets.update-schedule",
    "sheets.notify-attention",
    "crm.check-lead-sheet",
  ];

  it("runs the listeners, the check job and the dispatcher when Google is set up", () => {
    const jobs = workerJobs({
      ...base,
      sheets: {
        google: createMemoryGoogleSheets({ accountEmails: ["a@x.test", "b@x.test"] }),
        hashes: createSheetsHashes("k".repeat(40)),
        queue: createMemoryJobQueue(),
      },
    });
    const names = jobs.listeners.map((listener) => listener.name);
    for (const name of sheetsListeners) expect(names, name).toContain(name);
    expect(jobs.handlers.find((handler) => handler.queue === "sheets.check")).toMatchObject({ concurrency: 4 });
    expect(jobs.schedules.find((schedule) => schedule.queue === "sheets.dispatch-checks")).toMatchObject({
      cron: "* * * * *",
    });
  });

  it("runs none of it without Google, and no listener or queue is named twice", () => {
    const jobs = workerJobs(base);
    const names = jobs.listeners.map((listener) => listener.name);
    for (const name of sheetsListeners) expect(names, name).not.toContain(name);
    expect(jobs.handlers.map((handler) => handler.queue)).not.toContain("sheets.check");
    expect(jobs.schedules.map((schedule) => schedule.queue)).not.toContain("sheets.dispatch-checks");
    const withSheets = workerJobs({
      ...base,
      sheets: {
        google: createMemoryGoogleSheets(),
        hashes: createSheetsHashes("k".repeat(40)),
        queue: createMemoryJobQueue(),
      },
    });
    const all = [
      ...withSheets.listeners.map((listener) => listener.name),
      ...withSheets.handlers.map((handler) => handler.queue),
      ...withSheets.schedules.map((schedule) => schedule.queue),
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(createMemoryJobRunner(createMemoryJobQueue())).toBeTruthy();
  });
});
