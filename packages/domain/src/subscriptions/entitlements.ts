// What an organization may use today (spec 7.2): its plan plus its overrides, and its state today (the lifecycle as
// due today, or suspended while suspended by hand). Read on every request by the api's checks 2 and 3, under the
// organization's row-level security.
import type {
  LifecycleAccess,
  PlanModule,
  SubscriptionOverview,
  SubscriptionStatus,
} from "@travel-crm/contracts/subscriptions";
import type { Database, OrgTx } from "@travel-crm/db";
import type { CalendarDate } from "../kernel/index.js";
import { modulesOf, withPlan } from "./rows.js";
import { subscriptionToday } from "./state.js";

export interface Entitlements {
  /** The state today, even before the nightly job records it. */
  status: SubscriptionStatus;
  access: LifecycleAccess;
  planName: string;
  /** The plan's modules and those switched on early. */
  modules: ReadonlySet<PlanModule>;
  /** Seats are the plan's own plus the extra ones bought. */
  limits: { seats: number; whatsappNumbers: number; storageBytes: number };
  trialEndsOn: CalendarDate | null;
  paidThrough: CalendarDate | null;
  nextChangeOn: CalendarDate | null;
}

/** What staff may do in each state (spec 7.3). */
export function lifecycleAccessOf(status: SubscriptionStatus): LifecycleAccess {
  switch (status) {
    case "trial":
    case "active":
    case "past_due":
      return "full";
    case "read_only":
      return "read_only";
    case "suspended":
      return "export_only";
    case "cancelled":
      return "locked";
  }
}

/** The organization's entitlements at `now`, or null when it has no subscription. */
export async function entitlementsOf(tx: OrgTx, organizationId: string, now: Date): Promise<Entitlements | null> {
  const row = await tx.subscription.findUnique({ where: { organizationId }, include: withPlan });
  if (!row) return null;
  const today = await subscriptionToday(tx, row, now);
  return {
    status: today.status,
    access: lifecycleAccessOf(today.status),
    planName: row.plan.name,
    modules: new Set([...modulesOf(row.plan.modules), ...modulesOf(row.extraModules)]),
    limits: {
      seats: row.plan.seatLimit + row.extraSeats,
      whatsappNumbers: row.plan.whatsappNumberLimit,
      storageBytes: Number(row.plan.storageLimitBytes),
    },
    trialEndsOn: today.due.trialEndsOn,
    paidThrough: today.due.paidThrough,
    nextChangeOn: today.nextChangeOn,
  };
}

/** What subscription.get shows staff about their own subscription: no price. */
export function overviewOf(entitlements: Entitlements): SubscriptionOverview {
  return {
    status: entitlements.status,
    access: entitlements.access,
    planName: entitlements.planName,
    modules: [...entitlements.modules].sort(),
    trialEndsOn: entitlements.trialEndsOn,
    paidThrough: entitlements.paidThrough,
    nextChangeOn: entitlements.nextChangeOn,
    limits: entitlements.limits,
  };
}

/** The api's view of subscriptions: one read per request, in the organization's own transaction. */
export interface SubscriptionAccess {
  entitlementsOf(organizationId: string): Promise<Entitlements | null>;
}

export function createSubscriptionAccess(dependencies: {
  db: Pick<Database, "forOrg">;
  /** The time now; tests pass a fixed one. */
  now?: () => Date;
}): SubscriptionAccess {
  const now = dependencies.now ?? (() => new Date());
  return {
    entitlementsOf: (organizationId) =>
      dependencies.db.forOrg(organizationId, (tx) => entitlementsOf(tx, organizationId, now())),
  };
}
