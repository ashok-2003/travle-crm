// The platform dashboard (spec 7.4): each organization's status, days left, seats used, last activity and this month's
// usage, counted by the modules that keep them. The failed-jobs list is failed-jobs.test.ts's.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, calendarDateIn } from "../../src/kernel/index.js";
import { onboardOrganization, organizationsOverview } from "../../src/platform/index.js";
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
});
