// A set of room requests that began as an AI reading: audited as drafted by AI, approved by the member, with which requests
// they applied and which they changed first (compared by hash against what was proposed). The reading's row says which
// member asked and for which departure; a reading that isn't theirs or the departure's, or whose requests were all used
// already, is refused as "not found", so the audit never says the AI proposed what it didn't.
import type { RoomRequest } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";
import { hashOf } from "../suggest.js";

/** How a proposed or applied request is compared. */
export const requestHash = (request: string): string => hashOf(request);

export async function recordRoomRequestsApplied(
  tx: OrgTx,
  access: MemberAccess,
  use: { fillId: string; departureId: string; applied: readonly { travellerId: string; roomRequest: RoomRequest }[] },
  now: Date,
): Promise<void> {
  const fill = await tx.aiFill.findFirst({
    where: { id: use.fillId, requestedBy: access.userId, target: "room_requests", subjectId: use.departureId },
    select: { id: true, fields: true, fieldHashes: true, appliedFields: true, changedFields: true },
  });
  if (fill === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const proposed = use.applied.filter((one) => fill.fields.includes(one.travellerId));
  const fresh = proposed.filter((one) => !fill.appliedFields.includes(one.travellerId));
  if (fresh.length === 0) {
    // The same save again (a retry) says nothing more; a reading used up by another save is refused.
    if (proposed.length === 0 || fill.appliedFields.length === 0)
      throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
    return;
  }
  const hashes = fill.fieldHashes as Record<string, string>;
  const changed = fresh.filter((one) => requestHash(one.roomRequest) !== hashes[one.travellerId]);
  await tx.aiFill.update({
    where: { id: fill.id },
    data: {
      appliedAt: now,
      appliedBy: access.userId,
      appliedFields: [...fill.appliedFields, ...fresh.map((one) => one.travellerId)],
      changedFields: [...fill.changedFields, ...changed.map((one) => one.travellerId)],
    },
  });
  await recordAudit(tx, access, {
    action: "ai.fill-applied",
    entityType: "ai_fill",
    entityId: fill.id,
    after: { target: "room_requests", count: fresh.length, changedByMember: changed.length },
  });
}
