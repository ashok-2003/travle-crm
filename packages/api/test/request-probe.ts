// A probe router of every kind of procedure later modules will write, called for a member set up as a test asks, on
// stand-in identity and subscription services: for the tests of the request checks (spec 6.5).
import type { PlanModule, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import type { Identity, MemberAccess } from "@travel-crm/domain/identity";
import { PermissionSet } from "@travel-crm/domain/identity";
import { lifecycleAccessOf, type Entitlements } from "@travel-crm/domain/subscriptions";
import type { Context } from "../src/context.js";
import { freshProcedure, orgProcedure, protectedProcedure } from "../src/procedures.js";
import { subscriptionRouter } from "../src/routers/subscription.js";
import { router, t } from "../src/trpc.js";

const organizationId = "0199e7a0-0000-7000-8000-0000000000c1";
const userId = "0199e7a0-0000-7000-8000-0000000000c2";
export const adminUserId = "0199e7a0-0000-7000-8000-0000000000c3";

const core = { planModule: "core" } as const;

/** Procedures of every kind, as later modules will write them. */
const probe = router({
  view: orgProcedure.meta(core).query(() => "viewed"),
  change: orgProcedure.meta(core).mutation(() => "changed"),
  exportData: orgProcedure.meta({ ...core, lifecycle: "export" }).mutation(() => "exported"),
  revokeAccess: orgProcedure.meta({ ...core, lifecycle: "revoke" }).mutation(() => "revoked"),
  status: orgProcedure.meta({ ...core, lifecycle: "always" }).query(() => "status"),
  /** A procedure that forgot to say which module it belongs to. */
  undeclared: orgProcedure.query(() => "undeclared"),
  createLead: orgProcedure.requires("leads:create").mutation(() => "lead created"),
  manageStaff: freshProcedure.requires("staff:manage").mutation(() => "staff managed"),
  /** A business module's procedure that needs no permission: check 3 still applies, from its meta. */
  quoteTemplates: orgProcedure.meta({ planModule: "quotes" }).query(() => "templates"),
  subscription: subscriptionRouter,
  whoAmI: protectedProcedure.query(({ ctx }) => ctx.session.impersonatedBy ?? "nobody"),
});

export interface Setup {
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
export function callerFor(setup: Setup) {
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
    recordActivity: () => Promise.resolve(),
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
export async function outcome(call: Promise<string>): Promise<string> {
  try {
    return await call;
  } catch (error) {
    const cause = (error as { cause?: { reason?: string } }).cause;
    return cause?.reason ?? (error as { code: string }).code;
  }
}
