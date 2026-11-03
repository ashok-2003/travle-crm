// The platform dashboard (spec 7.4): each organization's status, days left, seats used, last activity and this month's
// usage, counted by the modules that keep them, a page at a time. The failed-jobs list is failed-jobs.test.ts's.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import type * as Audit from "../../src/audit/index.js";
import type * as Documents from "../../src/documents/index.js";
import type * as Files from "../../src/files/index.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, calendarDateIn, type CalendarDate } from "../../src/kernel/index.js";
import { onboardOrganization, organizationsOverview, type PlatformServices } from "../../src/platform/index.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

// Steps inside one organization's transaction must never overlap: each count function records, per transaction handle,
// how many run at once.
const overlap = vi.hoisted(() => ({ active: new WeakMap<object, number>(), peak: 0 }));
function watched<A extends [object, ...unknown[]], R>(count: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args) => {
    const [tx] = args;
    const now = (overlap.active.get(tx) ?? 0) + 1;
    overlap.active.set(tx, now);
    overlap.peak = Math.max(overlap.peak, now);
    try {
      return await count(...args);
    } finally {
      overlap.active.set(tx, (overlap.active.get(tx) ?? 1) - 1);
    }
  };
}
vi.mock("../../src/audit/index.js", async (original) => {
  const module = await original<typeof Audit>();
  return { ...module, auditEntriesSince: watched(module.auditEntriesSince) };
});
vi.mock("../../src/documents/index.js", async (original) => {
  const module = await original<typeof Documents>();
  return { ...module, documentsIssuedSince: watched(module.documentsIssuedSince) };
});
vi.mock("../../src/files/index.js", async (original) => {
  const module = await original<typeof Files>();
  return { ...module, bytesStored: watched(module.bytesStored) };
});

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

  it("gives the same overview for several organizations, in one pass of few transactions", async () => {
    const now = new Date();
    const today = calendarDateIn(now, "Asia/Kolkata");
    const seeded = [] as { organizationId: string; code: string; timeZone: string; trialEndsOn: CalendarDate }[];
    for (const [index, timeZone] of ["Asia/Kolkata", "America/New_York", "Asia/Kolkata"].entries()) {
      const input = onboardingInput(plan);
      const trialEndsOn = addDays(today, 10 + index * 5);
      const { organizationId } = await onboardOrganization(test.services, support, {
        ...input,
        timeZone,
        subscription: { ...input.subscription, trialEndsOn },
      });
      seeded.push({ organizationId, code: input.code, timeZone, trialEndsOn });
    }
    const [first, , last] = seeded;
    if (first === undefined || last === undefined) throw new Error("onboarding returned no organization");
    let inFlight = 0;
    let peak = 0;
    const counting: PlatformServices = {
      ...test.services,
      platformDb: {
        ...test.services.platformDb,
        transaction: async (fn, options) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          try {
            return await test.services.platformDb.transaction(fn, options);
          } finally {
            inFlight -= 1;
          }
        },
      },
    };
    const page = await organizationsOverview(counting, { limit: 200, after: justBefore(first.organizationId) }, now);
    const found = page.organizations.filter((overview) =>
      seeded.some((s) => s.organizationId === overview.organizationId),
    );
    expect(found.map((overview) => overview.organizationId)).toEqual(seeded.map((s) => s.organizationId));
    for (const [index, overview] of found.entries()) {
      const mine = seeded[index];
      if (mine === undefined) throw new Error("missing");
      const localToday = calendarDateIn(now, mine.timeZone);
      const nextChange = addDays(mine.trialEndsOn, 1);
      expect(overview).toEqual({
        organizationId: mine.organizationId,
        name: "Sharma Holidays",
        code: mine.code,
        status: "trial",
        planName: "Starter",
        nextChangeOn: nextChange,
        daysLeft: Math.round(
          (Date.parse(`${addDays(mine.trialEndsOn, 1)}T00:00:00Z`) - Date.parse(`${localToday}T00:00:00Z`)) /
            86_400_000,
        ),
        seats: { used: 1, limit: 5 },
        storage: { usedBytes: 0, limitBytes: 5_000_000_000 },
        lastActiveAt: null,
        thisMonth: { changes: 5, documentsIssued: 0 },
      });
    }
    // The page and its subscriptions come in one transaction; each organization's counts then run a pool's worth
    // (3) at a time, never one by one and never more than the console's pool holds.
    expect(overlap.peak).toBe(1);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(3);
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
