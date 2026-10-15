// The platform dashboard (spec 7.4): each organization's status, days left, seats used, last activity and this month's
// usage, counted by the modules that keep them; and the failed-jobs list, retried and cleared from the console.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, calendarDateIn } from "../../src/kernel/index.js";
import {
  listFailedJobs,
  listPlatformLog,
  listSchedules,
  onboardOrganization,
  organizationsOverview,
  removeSchedule,
  retryFailedJob,
} from "../../src/platform/index.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

describe("the platform dashboard", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  it("shows each organization's status, days left, seats, and this month's changes", async () => {
    // The dashboard's clock, taken before onboarding: every entry onboarding writes is at or after it, so this month's,
    // and the trial ends a fortnight from it, whatever today is.
    const now = new Date();
    const trialEndsOn = addDays(calendarDateIn(now, "Asia/Kolkata"), 14);
    const input = onboardingInput(plan);
    const { organizationId } = await onboardOrganization(test.services, support, {
      ...input,
      subscription: { ...input.subscription, trialEndsOn },
    });
    const overview = (await organizationsOverview(test.services, now)).find(
      (organization) => organization.organizationId === organizationId,
    );
    expect(overview).toEqual({
      organizationId,
      name: "Sharma Holidays",
      code: input.code,
      status: "trial",
      planName: "Starter",
      nextChangeOn: addDays(trialEndsOn, 1),
      daysLeft: 15,
      seats: { used: 1, limit: 5 },
      storage: { usedBytes: 0, limitBytes: 5_000_000_000 },
      lastActiveAt: null,
      // Onboarding's five entries: its profile, the Owner and their invite, the onboarding, the subscription.
      thisMonth: { changes: 5, documentsIssued: 0 },
    });
  });

  it("lists failed jobs, runs one again, and removes a leftover schedule, each in the platform log", async () => {
    test.jobs.failed.push({
      id: "0199e7a0-0000-7000-8000-0000000000fa",
      queue: "documents.render-pdf",
      data: { organizationId: "0199e7a0-0000-7000-8000-0000000000fb", eventId: "0199e7a0-0000-7000-8000-0000000000fc" },
      attempts: 6,
      failedAt: new Date("2026-10-16T06:00:00Z"),
      error: "Error: render failed",
    });
    test.jobs.scheduled.push({ queue: "reports.weekly-digest", cron: "0 8 * * 1", timeZone: "Asia/Kolkata" });
    expect(await listFailedJobs(test.services, 50)).toEqual([
      expect.objectContaining({ queue: "documents.render-pdf", attempts: 6, failedAt: "2026-10-16T06:00:00.000Z" }),
    ]);
    await retryFailedJob(test.services, support, {
      queue: "documents.render-pdf",
      jobId: "0199e7a0-0000-7000-8000-0000000000fa",
    });
    expect(test.jobs.retried).toEqual([
      { queue: "documents.render-pdf", jobId: "0199e7a0-0000-7000-8000-0000000000fa" },
    ]);
    await removeSchedule(test.services, support, "reports.weekly-digest");
    expect(await listSchedules(test.services)).toEqual([]);
    // Other test files write the platform log at the same time: look at this test's entries only.
    const log = await test.services.platformDb.transaction((tx) => listPlatformLog(tx, { limit: 100 }));
    const ours = log.entries.filter((entry) =>
      ["reports.weekly-digest", "0199e7a0-0000-7000-8000-0000000000fa"].includes(entry.targetId),
    );
    expect(ours.map((entry) => entry.action)).toEqual(["schedule.removed", "job.retried"]);
  });
});
