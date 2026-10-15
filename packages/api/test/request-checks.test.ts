// The request checks of spec 6.5 in the procedure builders, on stand-in identity and subscription services: 2 the
// organization's lifecycle state, 3 the module on the plan, 4 the role's permission, in that order; and support's
// impersonation read from the database every time, never from the cookie cache.
import type { Identity, MemberAccess } from "@travel-crm/domain/identity";
import { PermissionSet } from "@travel-crm/domain/identity";
import { lifecycleAccessOf, type Entitlements } from "@travel-crm/domain/subscriptions";
import type { PlanModule, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { describe, expect, it } from "vitest";
import type { Context } from "../src/context.js";
import { freshProcedure, orgProcedure, protectedProcedure } from "../src/procedures.js";
import { router, t } from "../src/trpc.js";

const organizationId = "0199e7a0-0000-7000-8000-0000000000c1";
const userId = "0199e7a0-0000-7000-8000-0000000000c2";
const adminUserId = "0199e7a0-0000-7000-8000-0000000000c3";

/** Procedures of every kind, as later modules will write them. */
const probe = router({
  view: orgProcedure.query(() => "viewed"),
  change: orgProcedure.mutation(() => "changed"),
  exportData: orgProcedure.meta({ lifecycle: "export" }).mutation(() => "exported"),
  status: orgProcedure.meta({ lifecycle: "always" }).query(() => "status"),
  createLead: orgProcedure.requires("leads:create").mutation(() => "lead created"),
  manageStaff: freshProcedure.requires("staff:manage").mutation(() => "staff managed"),
  whoAmI: protectedProcedure.query(({ ctx }) => ctx.session.impersonatedBy ?? "nobody"),
});

interface Setup {
  status?: SubscriptionStatus | "none";
  modules?: PlanModule[];
  isOwner?: boolean;
  granted?: string[];
  /** The session in the cookie cache. */
  impersonatedBy?: string | null;
  /** The session the database holds now: null once it is gone. */
  storedSession?: { impersonatedBy: string | null } | null;
  /** Whether the impersonating admin is still platform staff. */
  adminStillStaff?: boolean;
}

/** A caller of the probe router for a member set up as asked, and a count of database session reads. */
function callerFor(setup: Setup) {
  const reads = { sessions: 0 };
  const member: MemberAccess = {
    organizationId,
    userId,
    memberId: "0199e7a0-0000-7000-8000-0000000000c4",
    source: setup.impersonatedBy ? "impersonation" : "web",
    impersonatedBy: setup.impersonatedBy ?? null,
    role: { key: "sales", name: "Sales", isOwner: setup.isOwner ?? false },
    permissions: setup.isOwner
      ? PermissionSet.everything()
      : PermissionSet.fromStored((setup.granted ?? []).map((permission) => ({ permission, scope: null }))),
    mustChangePassword: false,
    twoFactorEnabled: false,
    organizationRequiresTwoFactor: false,
  };
  const session = { activeOrganizationId: organizationId, impersonatedBy: setup.impersonatedBy ?? null };
  const stored = setup.storedSession === undefined ? session : setup.storedSession;
  const identity = {
    auth: {
      api: {
        getSession: () => {
          reads.sessions += 1;
          return Promise.resolve({
            headers: new Headers(),
            response: stored && { session: { ...session, ...stored }, user: { id: userId } },
          });
        },
      },
    },
    resolveAccess: () => Promise.resolve(member),
    isPlatformAdmin: () => Promise.resolve(setup.adminStillStaff ?? true),
  } as unknown as Identity;
  const status = setup.status ?? "active";
  const entitlements: Entitlements | null =
    status === "none"
      ? null
      : {
          status,
          access: lifecycleAccessOf(status),
          planName: "Starter",
          modules: new Set(setup.modules ?? []),
          limits: { seats: 5, whatsappNumbers: 1, storageBytes: 1 },
          trialEndsOn: null,
          paidThrough: null,
          nextChangeOn: null,
        };
  const ctx = {
    identity,
    subscriptions: { entitlementsOf: () => Promise.resolve(entitlements) },
    headers: new Headers(),
    resHeaders: new Headers(),
    session,
    user: { id: userId },
  } as unknown as Context;
  return { caller: t.createCallerFactory(probe)(ctx), reads };
}

/** The reason a call is refused with, or what it answered. */
async function outcome(call: Promise<string>): Promise<string> {
  try {
    return await call;
  } catch (error) {
    const cause = (error as { cause?: { reason?: string } }).cause;
    return cause?.reason ?? (error as { code: string }).code;
  }
}

describe("request check 2: the organization's lifecycle state", () => {
  it("lets a read-only organization view and export, and refuses its changes", async () => {
    const { caller } = callerFor({ status: "read_only" });
    expect(await outcome(caller.view())).toBe("viewed");
    expect(await outcome(caller.exportData())).toBe("exported");
    expect(await outcome(caller.change())).toBe("ORGANIZATION_READ_ONLY");
  });

  it("lets only the Owner export while suspended", async () => {
    expect(await outcome(callerFor({ status: "suspended", isOwner: true }).caller.exportData())).toBe("exported");
    expect(await outcome(callerFor({ status: "suspended", isOwner: true }).caller.view())).toBe(
      "ORGANIZATION_SUSPENDED",
    );
    expect(await outcome(callerFor({ status: "suspended" }).caller.exportData())).toBe("ORGANIZATION_SUSPENDED");
  });

  it("refuses everything once cancelled, or without a subscription, except what every state allows", async () => {
    const cancelled = callerFor({ status: "cancelled", isOwner: true }).caller;
    expect(await outcome(cancelled.exportData())).toBe("ORGANIZATION_CANCELLED");
    expect(await outcome(cancelled.status())).toBe("status");
    expect(await outcome(callerFor({ status: "none" }).caller.view())).toBe("NO_SUBSCRIPTION");
  });

  it("comes before checks 3 and 4", async () => {
    // Read-only, the module not on the plan, and no permission: the lifecycle answers.
    expect(await outcome(callerFor({ status: "read_only" }).caller.createLead())).toBe("ORGANIZATION_READ_ONLY");
  });
});

describe("request check 3: the module on the plan", () => {
  it("refuses a permission whose module isn't on the plan, before checking the role", async () => {
    expect(await outcome(callerFor({ modules: [] }).caller.createLead())).toBe("MODULE_NOT_ON_PLAN");
    expect(await outcome(callerFor({ modules: ["crm"] }).caller.createLead())).toBe("MISSING_PERMISSION");
    expect(await outcome(callerFor({ modules: ["crm"], granted: ["leads:create"] }).caller.createLead())).toBe(
      "lead created",
    );
  });

  it("needs no module for the Foundation's own permissions", async () => {
    expect(await outcome(callerFor({ modules: [], isOwner: true }).caller.manageStaff())).toBe("staff managed");
  });
});

describe("support's impersonation", () => {
  it("is read from the database on every request, while other sessions use the cookie cache", async () => {
    const plain = callerFor({});
    expect(await outcome(plain.caller.whoAmI())).toBe("nobody");
    expect(plain.reads.sessions).toBe(0);
    const impersonating = callerFor({ impersonatedBy: adminUserId });
    expect(await outcome(impersonating.caller.whoAmI())).toBe(adminUserId);
    expect(impersonating.reads.sessions).toBe(1);
  });

  it("stops at once when its session is gone, though the cookie cache still holds it", async () => {
    const ended = callerFor({ impersonatedBy: adminUserId, storedSession: null });
    expect(await outcome(ended.caller.whoAmI())).toBe("UNAUTHORIZED");
    expect(await outcome(ended.caller.view())).toBe("UNAUTHORIZED");
  });

  it("stops at once when the admin is no longer platform staff", async () => {
    const demoted = callerFor({ impersonatedBy: adminUserId, adminStillStaff: false });
    expect(await outcome(demoted.caller.whoAmI())).toBe("UNAUTHORIZED");
    expect(await outcome(demoted.caller.manageStaff())).toBe("UNAUTHORIZED");
  });
});
