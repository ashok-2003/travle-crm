// What a lead from outside needs to know of an agency's people (release D): who can work leads and who its Owner is,
// asked of identity by id alone.
import type { IntakePeople } from "@travel-crm/domain/connectors";
import type { Identity } from "@travel-crm/domain/identity";

export function intakePeople(identity: Pick<Identity, "leadWorkers" | "firstOwner">): IntakePeople {
  return {
    leadWorkerIds: async (organizationId) =>
      new Set((await identity.leadWorkers(organizationId)).map((worker) => worker.userId)),
    firstOwner: (organizationId) => identity.firstOwner(organizationId),
  };
}
