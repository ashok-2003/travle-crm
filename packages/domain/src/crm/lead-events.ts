// A lead's timeline (spec 3.4, 5): one slim row per thing that happened to a lead, pointing at the note, enquiry or
// task it is about. Every crm change writes its entry in its own transaction, and the api writes "follow-up done"
// through this when a lead's task is done (R22): tasks sits below crm and never calls it.
import type { AssignedBy, LeadEventKind, LeadStage } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";

export interface LeadEventEntry {
  leadId: string;
  kind: LeadEventKind;
  /** The row the entry is about: a note, a repeat enquiry or a task. */
  record?: { recordType: "lead_note" | "lead_enquiry" | "task"; recordId: string };
  /** The stage it moved to, for stage-changed. */
  stage?: LeadStage;
  /** The new owner, for reassigned. */
  ownerUserId?: string | null;
  /** Why an automatic assignment chose the owner, for created (spec 4.7); the owner goes in ownerUserId. */
  assignedBy?: AssignedBy;
  /** When it happened; now unless given. */
  occurredAt?: Date;
}

/** Adds one entry to the lead's timeline, as the actor's (the system's when they have no user). */
export async function recordLeadEvent(tx: OrgTx, actor: Actor, entry: LeadEventEntry): Promise<void> {
  await tx.leadTimelineEntry.create({
    data: {
      leadId: entry.leadId,
      kind: entry.kind,
      actorUserId: actor.userId,
      recordType: entry.record?.recordType ?? null,
      recordId: entry.record?.recordId ?? null,
      stage: entry.stage ?? null,
      ownerUserId: entry.ownerUserId ?? null,
      ...(entry.assignedBy === undefined
        ? {}
        : {
            assignmentReason: entry.assignedBy.reason,
            assignmentRulePosition: entry.assignedBy.rulePosition,
            assignmentAway: entry.assignedBy.away,
          }),
      ...(entry.occurredAt === undefined ? {} : { occurredAt: entry.occurredAt }),
    },
  });
}
