// A lead's stage and owner changed from its page (spec 3.4, 4): moved to any stage, reopened where it was (R30), or
// given to someone who can work leads (R14). The changes themselves are lead-core's (P9); here the member must see the
// lead (R26), and a stale tap from a second tab changes nothing (R31).
import {
  isOpenStage,
  leadStage,
  openLeadStage,
  type LeadIdInput,
  type MoveStageInput,
  type ReassignLeadInput,
} from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { changeLeadOwner, changeLeadStage } from "./lead-core.js";
import { findLeadInScope } from "./lead-detail.js";

/** Moves the lead to a stage, forwards or back; the stage it is in already changes nothing (R31). */
export async function moveLeadStage(tx: OrgTx, access: MemberAccess, input: MoveStageInput, now: Date): Promise<void> {
  const lead = await findLeadInScope(tx, access, input.leadId);
  await changeLeadStage(tx, access, { leadId: lead.id, stage: input.stage }, now);
}

/**
 * Returns a closed lead to the open stage it left, or New (R30); an open lead changes nothing (R31). Its stage and its
 * owner (whether the member may reopen it) are read under the row's lock, so a reopen that waited behind another
 * tab's move or a manager's reassign sees that change, not what it would have read first.
 */
export async function reopenLead(tx: OrgTx, access: MemberAccess, input: LeadIdInput, now: Date): Promise<void> {
  const [locked] = await tx.$queryRaw<{ stage: string; reopenStage: string | null }[]>`
    SELECT stage, reopen_stage AS "reopenStage" FROM lead
    WHERE id = ${input.leadId}::uuid AND deleted_at IS NULL
    FOR UPDATE`;
  if (locked === undefined) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such lead");
  // Whose lead it is, read under the lock: a reassign that committed while this waited decides it.
  const lead = await findLeadInScope(tx, access, input.leadId);
  if (isOpenStage(leadStage.parse(locked.stage))) return;
  const stage = locked.reopenStage === null ? "new" : openLeadStage.parse(locked.reopenStage);
  await changeLeadStage(tx, access, { leadId: lead.id, stage }, now);
}

/** Gives the lead, with its open tasks, to someone who can work leads (`owners`, R14); its owner already, nothing. */
export async function reassignLead(
  tx: OrgTx,
  access: MemberAccess,
  input: ReassignLeadInput,
  context: { owners: ReadonlySet<string>; now: Date },
): Promise<void> {
  const lead = await findLeadInScope(tx, access, input.leadId);
  if (!context.owners.has(input.ownerUserId)) {
    throw new DomainError("VALIDATION", "NOT_A_LEAD_WORKER", "That person can't work leads");
  }
  await changeLeadOwner(tx, access, { leadId: lead.id, ownerUserId: input.ownerUserId });
}
