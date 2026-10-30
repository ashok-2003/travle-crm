// A save that began as an AI fill: audited as drafted by AI, approved by the member, with which fields they applied and which
// they then changed (compared by hash against what was proposed). The fill's row says which member asked, for which target and
// subject, and what was proposed (by hash); a fill that isn't the member's, the target's or the subject's, or whose fields
// were all used already, is refused as "not found", so the audit never says the AI wrote what it didn't.
import { fillPath, type AiFillUse, type FillPath, type FillTarget } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";
import { valueHash } from "./values.js";

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");

/**
 * `saved` holds the value the save wrote at each path (absent or null when the form left it empty). `targets` are the fill
 * targets this save may use: a call note's fill is used by the call (call_note) and by the lead's trip (call_note again).
 */
export async function recordFillApplied(
  tx: OrgTx,
  access: MemberAccess,
  use: AiFillUse,
  save: {
    targets: readonly FillTarget[];
    subject?: { type: "lead" | "quote"; id: string };
    saved: Partial<Record<FillPath, unknown>>;
  },
  now: Date,
): Promise<void> {
  const fill = await tx.aiFill.findFirst({
    where: { id: use.fillId, requestedBy: access.userId, target: { in: [...save.targets] } },
    select: {
      id: true,
      target: true,
      subjectType: true,
      subjectId: true,
      fields: true,
      fieldHashes: true,
      appliedFields: true,
      changedFields: true,
    },
  });
  if (fill === null) throw notFound();
  // A fill made for one lead or quote is used for that one; a new lead's fill has none yet.
  if (fill.subjectId !== null && save.subject !== undefined && fill.subjectId !== save.subject.id) throw notFound();
  const paths = [...new Set(use.paths)].filter(
    (path) => fill.fields.includes(path) && fillPath.safeParse(path).success,
  );
  const fresh = paths.filter((path) => !fill.appliedFields.includes(path));
  // Nothing new to record: the same save again (a retry) says nothing more; a fill used up by another save is refused.
  if (fresh.length === 0) {
    if (paths.length === 0 || fill.appliedFields.length === 0) throw notFound();
    return;
  }
  const hashes = fill.fieldHashes as Record<string, string>;
  const changed = fresh.filter((path) => {
    const value = save.saved[path as FillPath];
    return value === undefined || value === null || valueHash(path as FillPath, value) !== hashes[path];
  });
  await tx.aiFill.update({
    where: { id: fill.id },
    data: {
      appliedAt: now,
      appliedBy: access.userId,
      appliedFields: [...fill.appliedFields, ...fresh],
      changedFields: [...fill.changedFields, ...changed],
      // A new lead's fill now knows its lead, so the customer's erasure finds the recording it was filled from.
      ...(fill.subjectId === null && save.subject !== undefined
        ? { subjectType: save.subject.type, subjectId: save.subject.id }
        : {}),
    },
  });
  await recordAudit(tx, access, {
    action: "ai.fill-applied",
    entityType: "ai_fill",
    entityId: fill.id,
    after: { target: fill.target, applied: fresh, changedByMember: changed },
  });
}
