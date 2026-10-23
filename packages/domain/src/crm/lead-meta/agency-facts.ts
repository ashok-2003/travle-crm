// What saving a lead needs to know about the agency, found afresh for each run (spec M9, 8.5): who the Owner is, who can
// work leads, the time zone, and whether the subscription still allows changes and has the CRM.
import { DomainError } from "../../kernel/index.js";
import type { Identity } from "../../identity/index.js";
import { assertLifecycleAllows, assertOnPlan, type SubscriptionAccess } from "../../subscriptions/index.js";

export interface AgencyFacts {
  ownerUserId: string;
  workers: ReadonlySet<string>;
  timeZone: string;
}

export interface AgencyDependencies {
  identity: Pick<Identity, "firstOwner" | "leadWorkers" | "organizationProfile">;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
}

const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/** Whether the agency may change things and has the CRM on its plan (spec 8.5): read-only or suspended agencies bring in nothing. */
export async function mayBringIn(dependencies: AgencyDependencies, organizationId: string): Promise<boolean> {
  const entitlements = await dependencies.subscriptions.entitlementsOf(organizationId);
  try {
    assertLifecycleAllows(entitlements, { kind: "change", isOwner: false });
    assertOnPlan(entitlements, ["crm"]);
    return true;
  } catch (error) {
    if (error instanceof DomainError) return false;
    throw error;
  }
}

/** The facts, or null when the agency has no Owner to give a lead to (nothing can be saved). */
export async function agencyFactsOf(
  dependencies: AgencyDependencies,
  organizationId: string,
): Promise<AgencyFacts | null> {
  const ownerUserId = await dependencies.identity.firstOwner(organizationId);
  if (ownerUserId === null) return null;
  const workers = await dependencies.identity.leadWorkers(organizationId);
  const profile = await dependencies.identity.organizationProfile(organizationId);
  return {
    ownerUserId,
    workers: new Set(workers.map((worker) => worker.userId)),
    timeZone: profile?.timeZone ?? DEFAULT_TIME_ZONE,
  };
}
