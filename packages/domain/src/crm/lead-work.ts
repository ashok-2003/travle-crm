// Follow-ups and tasks on a lead (spec 3.4, 4): always the lead's owner's, whoever adds them, so they move with it
// (R21); due at a day and time on the agency's clock, never one already past (R25); "follow-up added" on the timeline.
// The lead is read under its lock, so a reassign or a close at the same moment applies wholly before this or wholly
// after it: the follow-up goes to the owner the lead has, or moves or is cancelled with the rest of its work (R21, R29).
import { isOpenStage, leadStage, type AddLeadWorkInput } from "@travel-crm/contracts/crm";
import type { Task } from "@travel-crm/contracts/tasks";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import type { Actor } from "../kernel/index.js";
import { createTask, dueInstant } from "../tasks/index.js";
import { lockLead } from "./lead-core.js";
import { findLeadInScope } from "./lead-detail.js";
import { recordLeadEvent } from "./lead-events.js";

/** Adds a follow-up or task to the lead, for its owner, and writes follow-up-added on its timeline. */
export async function addLeadWork(tx: OrgTx, access: MemberAccess, input: AddLeadWorkInput, now: Date): Promise<Task> {
  await lockLead(tx, input.leadId);
  // Whose lead it is, read under the lock: a reassign that committed while this waited decides it.
  const lead = await findLeadInScope(tx, access, input.leadId);
  const dueAt = await dueInstant(tx, access.organizationId, input.due, now);
  const task = await createTask(tx, access, {
    kind: input.kind,
    title: input.title,
    dueAt,
    assigneeUserId: lead.ownerUserId,
    record: { recordType: "lead", recordId: lead.id },
  });
  const record = { recordType: "task", recordId: task.id } as const;
  await recordLeadEvent(tx, access, { leadId: lead.id, kind: "follow-up-added", record, occurredAt: now });
  return task;
}

/**
 * A follow-up the AI adds from a chat (2026-10-30), for the lead's owner, with follow-up-added on its timeline. Only on
 * an open lead, and only one of the AI's open at a time: a customer saying "later" twice adds one, and the team's own
 * follow-ups stand. Null when none was added.
 */
export async function addAiFollowUp(
  tx: OrgTx,
  actor: Actor,
  input: { leadId: string; title: string; dueAt: Date },
  now: Date,
): Promise<Task | null> {
  await lockLead(tx, input.leadId);
  const lead = await tx.lead.findFirst({
    where: { id: input.leadId },
    select: { id: true, stage: true, ownerUserId: true },
  });
  if (lead === null || !isOpenStage(leadStage.parse(lead.stage))) return null;
  const open = await tx.task.findFirst({
    where: { recordType: "lead", recordId: lead.id, byAi: true, doneAt: null, cancelledAt: null },
    select: { id: true },
  });
  if (open !== null) return null;
  const task = await createTask(tx, actor, {
    kind: "follow-up",
    title: input.title,
    dueAt: input.dueAt,
    assigneeUserId: lead.ownerUserId,
    record: { recordType: "lead", recordId: lead.id },
    byAi: true,
  });
  const record = { recordType: "task", recordId: task.id } as const;
  await recordLeadEvent(tx, actor, { leadId: lead.id, kind: "follow-up-added", record, occurredAt: now });
  return task;
}
