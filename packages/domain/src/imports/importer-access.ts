// B31: the job acts as the importer, with their access resolved afresh each time it runs: still a member, still
// holding what the import needs, in an agency whose subscription still allows changes and has the module. Any job that
// acts as a member (a Google Sheet's connector) resolves them the same way, through jobMemberAccess.
import type { ImportFailureReason } from "@travel-crm/contracts/imports";
import { moduleOf, type MemberAccess, type Permission } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import {
  assertLifecycleAllows,
  assertOnPlan,
  planModuleOf,
  type ProcedureModule,
  type SubscriptionAccess,
} from "../subscriptions/index.js";
import type { ImportBatchRow } from "./batch-row.js";
import type { ImportIdentity } from "./dependencies.js";

/** What resolving a member's access for a job needs: identity's access afresh and the subscription. */
export interface JobAccessDependencies {
  identity: Pick<ImportIdentity, "resolveAccess">;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
}

/**
 * A member's access as a job's actor, or why the job can't go on as them. The actor's source is "job"; when support
 * started the work while impersonating, it is "impersonation" with their id, as the request recorded it: the audit
 * log names support exactly on impersonation entries (audit_entry_impersonation).
 */
export async function jobMemberAccess(
  dependencies: JobAccessDependencies,
  who: { organizationId: string; userId: string; impersonatedBy: string | null },
  required: readonly Permission[],
): Promise<{ access: MemberAccess } | { failure: ImportFailureReason }> {
  const access = await dependencies.identity.resolveAccess(who.userId, who.organizationId, {
    impersonatedBy: who.impersonatedBy,
  });
  if (access === null) return { failure: "no_longer_a_member" };
  if (access.permissions.missing(required).length > 0) return { failure: "lost_permission" };
  const entitlements = await dependencies.subscriptions.entitlementsOf(who.organizationId);
  const planModules = required.map((permission): ProcedureModule => planModuleOf(moduleOf(permission)) ?? "core");
  try {
    assertLifecycleAllows(entitlements, { kind: "change", isOwner: access.role.isOwner });
    assertOnPlan(entitlements, planModules);
  } catch (error) {
    if (error instanceof DomainError) return { failure: "organization_cannot_change" };
    throw error;
  }
  const source = who.impersonatedBy === null ? "job" : "impersonation";
  return { access: { ...access, source, impersonatedBy: who.impersonatedBy } };
}

/** The import's starter's access as its job's actor (B31), or why the import can't go on. */
export function importerAccess(
  dependencies: JobAccessDependencies,
  batch: Pick<ImportBatchRow, "organizationId" | "startedBy" | "impersonatedBy">,
  required: readonly Permission[],
): Promise<{ access: MemberAccess } | { failure: ImportFailureReason }> {
  const { organizationId, startedBy, impersonatedBy } = batch;
  return jobMemberAccess(dependencies, { organizationId, userId: startedBy, impersonatedBy }, required);
}
