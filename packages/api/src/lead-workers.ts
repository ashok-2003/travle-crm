// The user ids of the people who can work leads (R14), for the procedures that give a lead or a task to someone: read
// only when the input names someone other than the caller, the one case the domain checks them.
import type { Identity, MemberAccess } from "@travel-crm/domain/identity";

export async function leadWorkerIds(
  identity: Identity,
  member: MemberAccess,
  named: string | null,
): Promise<ReadonlySet<string>> {
  if (named === null || named === member.userId) return new Set();
  return new Set((await identity.leadWorkers(member.organizationId)).map((worker) => worker.userId));
}
