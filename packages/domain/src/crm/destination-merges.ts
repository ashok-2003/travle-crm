// Merging destinations (spec 3.6): catalog merges the rows, and the leads and repeat enquiries of the one merged away
// move to the one kept, in the same transaction (R22). Erased leads move too, so later reports count them in one place.
import type { MergeDestinationsInput, MergedDestinations } from "@travel-crm/contracts/catalog";
import { withDeleted, type OrgTx } from "@travel-crm/db";
import { mergeDestination } from "../catalog/index.js";
import type { MemberAccess } from "../identity/index.js";

/** Merges one destination into another and moves what was on it; says how many live leads moved. */
export async function mergeDestinations(
  tx: OrgTx,
  actor: MemberAccess,
  input: MergeDestinationsInput,
): Promise<MergedDestinations> {
  await mergeDestination(tx, actor, input);
  const to = { destinationId: input.intoDestinationId };
  const live = await tx.lead.updateMany({ where: { destinationId: input.destinationId }, data: to });
  await withDeleted(() =>
    tx.lead.updateMany({ where: { destinationId: input.destinationId, deletedAt: { not: null } }, data: to }),
  );
  await tx.leadEnquiry.updateMany({ where: { destinationId: input.destinationId }, data: to });
  return { leadsMoved: live.count };
}
