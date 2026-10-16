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

/** Returns a closed lead to the open stage it left, or New (R30); an open lead changes nothing. */
export async function reopenLead(tx: OrgTx, access: MemberAccess, input: LeadIdInput, now: Date): Promise<void> {
  const lead = await findLeadInScope(tx, access, input.leadId);
  if (isOpenStage(leadStage.parse(lead.stage))) return;
  const stage = lead.reopenStage === null ? "new" : openLeadStage.parse(lead.reopenStage);
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
