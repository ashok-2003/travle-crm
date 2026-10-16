// The user ids of the people who can work leads (R14), for the procedures that give a lead or a task to someone. The
// domain checks them only when the input names someone other than the caller, so those procedures read them only
// then; a reassignment always names an owner, so it always reads them.
import type { Identity, MemberAccess } from "@travel-crm/domain/identity";

/** Every lead worker's user id. */
export async function leadWorkerIds(identity: Identity, organizationId: string): Promise<ReadonlySet<string>> {
  return new Set((await identity.leadWorkers(organizationId)).map((worker) => worker.userId));
}

/** The lead workers' user ids when `named` is someone other than the caller; none otherwise. */
export function leadWorkerIdsIfOther(
  identity: Identity,
  member: MemberAccess,
  named: string | null,
): Promise<ReadonlySet<string>> {
  if (named === null || named === member.userId) return Promise.resolve(new Set());
  return leadWorkerIds(identity, member.organizationId);
}
