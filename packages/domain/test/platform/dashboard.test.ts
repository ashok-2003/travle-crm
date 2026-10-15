// The platform dashboard (spec 7.4): each organization's status, days left, seats used, last activity and this month's
// usage, counted by the modules that keep them, a page at a time. The failed-jobs list is failed-jobs.test.ts's.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, calendarDateIn } from "../../src/kernel/index.js";
import { onboardOrganization, organizationsOverview } from "../../src/platform/index.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

/** The id just below this one: a page after it starts with this organization, whatever other test files add. */
function justBefore(id: string): string {
  const hex = (BigInt(`0x${id.replaceAll("-", "")}`) - 1n).toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
    const page = await organizationsOverview(test.services, { limit: 1, after: justBefore(organizationId) }, now);
    const [overview] = page.organizations;
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

  it("comes a page at a time, oldest first, each page after the last one's organization", async () => {
    const onboarded: string[] = [];
    for (let count = 0; count < 3; count += 1) {
      onboarded.push((await onboardOrganization(test.services, support, onboardingInput(plan))).organizationId);
    }
    const [first, , last] = onboarded;
    if (first === undefined || last === undefined) throw new Error("onboarding returned no organization");
    // Other test files onboard at the same time, so between ours there may be theirs.
    const seen: string[] = [];
    let after: string | undefined = justBefore(first);
    while (after !== undefined && !seen.includes(last)) {
      const page = await organizationsOverview(test.services, { limit: 2, after });
      expect(page.organizations.length).toBeLessThanOrEqual(2);
      seen.push(...page.organizations.map((organization) => organization.organizationId));
      after = page.nextCursor ?? undefined;
      if (page.nextCursor !== null) expect(page.nextCursor).toBe(seen.at(-1));
    }
    expect(seen.filter((id) => onboarded.includes(id))).toEqual(onboarded);
    expect(seen).toEqual([...new Set(seen)].sort());
  });
});
