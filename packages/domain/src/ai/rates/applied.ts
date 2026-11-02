// A batch of rates that began as an AI reading of a rate sheet: audited as drafted by AI, approved by the member, with which rows
// they saved and which they changed first (compared by hash against what was proposed). The reading's row says which member asked
// and for which supplier; a reading that isn't theirs or the supplier's, or whose rows were all used already, is "not found", so
// the audit never says the AI proposed what it didn't.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";
import { rowHash } from "./rows.js";

export interface SavedRateRow {
  ref: string;
  item: string;
  mealPlan: string;
  occupancy: string;
  unit: string;
  costPaise: number;
}

export async function recordRatesApplied(
  tx: OrgTx,
  access: MemberAccess,
  use: { fillId: string; supplierId: string; saved: readonly SavedRateRow[] },
  now: Date,
): Promise<void> {
  const fill = await tx.aiFill.findFirst({
    where: { id: use.fillId, requestedBy: access.userId, target: "rate_sheet", subjectId: use.supplierId },
    select: { id: true, fields: true, fieldHashes: true, appliedFields: true, changedFields: true },
  });
  if (fill === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const proposed = use.saved.filter((one) => fill.fields.includes(one.ref));
  const fresh = proposed.filter((one) => !fill.appliedFields.includes(one.ref));
  if (fresh.length === 0) {
    // The same save again (a retry) says nothing more; a reading used up by another save is refused.
    if (proposed.length === 0 || fill.appliedFields.length === 0)
      throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
    return;
  }
  const hashes = fill.fieldHashes as Record<string, string>;
  const changed = fresh.filter((one) => rowHash(one) !== hashes[one.ref]);
  await tx.aiFill.update({
    where: { id: fill.id },
    data: {
      appliedAt: now,
      appliedBy: access.userId,
      appliedFields: [...fill.appliedFields, ...fresh.map((one) => one.ref)],
      changedFields: [...fill.changedFields, ...changed.map((one) => one.ref)],
    },
  });
  await recordAudit(tx, access, {
    action: "ai.fill-applied",
    entityType: "ai_fill",
    entityId: fill.id,
    after: { target: "rate_sheet", count: fresh.length, changedByMember: changed.length },
  });
}
