// The access cache in the procedure builders, on a real database and subscription: a batch resolves the member once,
// a change made through the api applies to the next call, a change made outside it within five minutes, a pending step
// is never kept, the subscription's state follows the clock while its facts are kept, and a fresh procedure always reads.
import { randomUUID } from "node:crypto";
import { createTestOrganization } from "@travel-crm/db/testing";
import { PermissionSet, type Identity, type MemberAccess } from "@travel-crm/domain/identity";
import { createPlan, createSubscriptionAccess, startSubscription } from "@travel-crm/domain/subscriptions";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ACCESS_CACHE_TTL_MS, createAccessCache } from "../src/access-cache.js";
import type { Context } from "../src/context.js";
import { freshProcedure, orgProcedure } from "../src/procedures.js";
import { router, t } from "../src/trpc.js";
import { createHarness, type Harness } from "./forms-support.js";
import { outcome } from "./request-probe.js";

const core = { planModule: "core" } as const;
const target = z.strictObject({ userId: z.string() });

describe("the access cache in the request checks", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());
  afterEach(() => vi.useRealTimers());

  async function setup(trialEndsOn: string | null = null) {
    const organizationId = await createTestOrganization(harness.platform, "Asha Travels");
    await harness.platformDb.transaction(async (tx) => {
      const plan = await createPlan(tx, {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: "Starter",
        monthlyPricePaise: 250_000,
        yearlyPricePaise: null,
        extraSeatMonthlyPricePaise: null,
        extraSeatYearlyPricePaise: null,
        seatLimit: 5,
        whatsappNumberLimit: 1,
        storageLimitBytes: 5_000_000_000,
        modules: ["crm"],
      });
      await startSubscription(
        tx,
        { userId: randomUUID() },
        {
          organizationId,
          planId: plan.id,
          billingCycle: "monthly",
          trialEndsOn,
          paidThrough: trialEndsOn ? null : "2027-12-31",
        },
        new Date("2026-10-22T06:00:00Z"),
      );
    });

    const memberOf = (granted: "everything" | "view"): MemberAccess => ({
      organizationId,
      userId: randomUUID(),
      memberId: randomUUID(),
      source: "web",
      impersonatedBy: null,
      role: { key: "r", name: "R", isOwner: granted === "everything" },
      permissions:
        granted === "everything"
          ? PermissionSet.everything()
          : PermissionSet.of([{ permission: "leads:view", scope: "all" as const }]),
      mustChangePassword: false,
      twoFactorEnabled: false,
      organizationRequiresTwoFactor: false,
    });
    const owner = memberOf("everything");
    const salesperson = memberOf("view");
    const members = new Map([owner, salesperson].map((member) => [member.userId, member]));
    const resolveAccess = vi.fn((userId: string) => Promise.resolve(members.get(userId) ?? null));
    const identity = {
      resolveAccess,
      recordActivity: () => Promise.resolve(),
      isPlatformAdmin: () => Promise.resolve(false),
      auth: {
        api: {
          getSession: ({ headers }: { headers: Headers }) =>
            Promise.resolve({
              headers: new Headers(),
              response: {
                session: { activeOrganizationId: organizationId, impersonatedBy: null },
                user: { id: headers.get("x-user") },
              },
            }),
        },
      },
    } as unknown as Identity;

    const probe = router({
      list: orgProcedure.requires("leads:view").query(() => "listed"),
      ping: orgProcedure.meta(core).query(() => "pinged"),
      change: orgProcedure.meta(core).mutation(() => "changed"),
      telemetry: orgProcedure.meta({ ...core, keepsAccess: true }).mutation(() => "beat"),
      create: orgProcedure.requires("leads:create").mutation(() => "created"),
      fresh: freshProcedure.meta(core).query(() => "fresh"),
      // What the Staff screen's role change and removal do, to the stand-in identity.
      demote: freshProcedure
        .meta(core)
        .input(target)
        .mutation(({ input }) => {
          const member = members.get(input.userId);
          if (member) members.set(input.userId, { ...member, permissions: PermissionSet.of([]) });
          return "demoted";
        }),
      remove: freshProcedure
        .meta(core)
        .input(target)
        .mutation(({ input }) => {
          members.delete(input.userId);
          return "removed";
        }),
    });

    const clock = { cache: 0 };
    const factsOf = vi.fn((id: string) => createSubscriptionAccess({ db: harness.db }).factsOf(id));
    const accessCache = createAccessCache({
      ttlMs: ACCESS_CACHE_TTL_MS,
      maxEntries: 100,
      now: () => clock.cache,
    });
    const callerOf = (member: MemberAccess) =>
      t.createCallerFactory(probe)({
        identity,
        subscriptions: { factsOf, now: () => new Date() },
        accessCache,
        headers: new Headers({ "x-user": member.userId }),
        resHeaders: new Headers(),
        session: { activeOrganizationId: organizationId, impersonatedBy: null },
        user: { id: member.userId },
      } as unknown as Context);
    return { owner, salesperson, members, resolveAccess, factsOf, clock, callerOf };
  }

  it("a batch resolves the member once", async () => {
    const { salesperson, resolveAccess, callerOf } = await setup();
    const caller = callerOf(salesperson);
    await Promise.all([caller.list(), caller.list(), caller.ping()]);
    expect(resolveAccess).toHaveBeenCalledTimes(1);
  });

  it("a second request within five minutes reads nothing again", async () => {
    const { salesperson, resolveAccess, factsOf, clock, callerOf } = await setup();
    await callerOf(salesperson).list();
    clock.cache += ACCESS_CACHE_TTL_MS;
    await callerOf(salesperson).list();
    expect(resolveAccess).toHaveBeenCalledTimes(1);
    expect(factsOf).toHaveBeenCalledTimes(1);
  });

  it("a role changed through the api applies to the next call", async () => {
    const { owner, salesperson, callerOf } = await setup();
    expect(await outcome(callerOf(salesperson).list())).toBe("listed");
    await callerOf(owner).demote({ userId: salesperson.userId });
    expect(await outcome(callerOf(salesperson).list())).toBe("MISSING_PERMISSION");
  });

  it("a member removed through the api is refused at once", async () => {
    const { owner, salesperson, callerOf } = await setup();
    expect(await outcome(callerOf(salesperson).list())).toBe("listed");
    await callerOf(owner).remove({ userId: salesperson.userId });
    expect(await outcome(callerOf(salesperson).list())).toBe("NOT_A_MEMBER");
  });

  it("a keepsAccess mutation leaves the cache warm and an ordinary one clears it", async () => {
    const { salesperson, resolveAccess, callerOf } = await setup();
    await callerOf(salesperson).ping();
    await callerOf(salesperson).telemetry();
    await callerOf(salesperson).ping();
    expect(resolveAccess).toHaveBeenCalledTimes(1);
    await callerOf(salesperson).change();
    await callerOf(salesperson).ping();
    expect(resolveAccess).toHaveBeenCalledTimes(2);
  });

  it("a refused mutation leaves the cache alone", async () => {
    const { salesperson, resolveAccess, callerOf } = await setup();
    await callerOf(salesperson).list();
    expect(await outcome(callerOf(salesperson).create())).toBe("MISSING_PERMISSION");
    await callerOf(salesperson).list();
    expect(resolveAccess).toHaveBeenCalledTimes(1);
  });

  it("a role changed outside the api applies within five minutes", async () => {
    const { salesperson, members, clock, callerOf } = await setup();
    expect(await outcome(callerOf(salesperson).list())).toBe("listed");
    members.set(salesperson.userId, { ...salesperson, permissions: PermissionSet.of([]) });
    expect(await outcome(callerOf(salesperson).list())).toBe("listed");
    clock.cache += ACCESS_CACHE_TTL_MS + 1;
    expect(await outcome(callerOf(salesperson).list())).toBe("MISSING_PERMISSION");
  });

  it("a pending password change is never cached", async () => {
    const { salesperson, members, callerOf } = await setup();
    members.set(salesperson.userId, { ...salesperson, mustChangePassword: true });
    expect(await outcome(callerOf(salesperson).list())).toBe("CHANGE_PASSWORD");
    members.set(salesperson.userId, { ...salesperson, mustChangePassword: false });
    expect(await outcome(callerOf(salesperson).list())).toBe("listed");
  });

  it("a trial ends with its days though its facts are cached", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T06:00:00Z"));
    const { owner, factsOf, callerOf } = await setup("2026-10-22");
    expect(await outcome(callerOf(owner).ping())).toBe("pinged");
    // Past due from 23 October, read-only from 30 October (the policy's seven days): same cached facts.
    vi.setSystemTime(new Date("2026-10-30T06:00:00Z"));
    expect(await outcome(callerOf(owner).change())).toBe("ORGANIZATION_READ_ONLY");
    expect(await outcome(callerOf(owner).ping())).toBe("pinged");
    expect(factsOf).toHaveBeenCalledTimes(1);
  });

  it("freshProcedure always reads the member", async () => {
    const { owner, resolveAccess, callerOf } = await setup();
    await callerOf(owner).fresh();
    await callerOf(owner).fresh();
    expect(resolveAccess).toHaveBeenCalledTimes(2);
  });
});
