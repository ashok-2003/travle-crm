// Writing a lead (spec 3.2, 4): the row, its timeline and audit entries and lead.created. The form, an import and the
// demo all write a lead through this; whom it tells is theirs to decide.
import type { AssignedBy, LeadSource, LeadStage } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import type { Actor } from "../kernel/index.js";
import { recordCrmAudit } from "./crm-audit.js";
import { recordLeadEvent } from "./lead-events.js";
import { tripColumns, type TripRecord } from "./trip-columns.js";
import type { EnquiryAuditDetail } from "./audit-detail.js";

/** A lead as it is written: the person and the destination already found or added. */
export interface NewLeadRecord {
  personId: string;
  trip: TripRecord;
  /** New unless given (the demo's leads are in every stage). */
  stage?: LeadStage;
  returning: boolean;
  /** Null for the Unassigned queue: nobody could take it (release C). */
  ownerUserId: string | null;
  source: LeadSource;
  sourceDetail: string | null;
  /** Why the agency's assignment chose the owner, for a lead that arrived by itself (spec 4.7). */
  assignedBy?: AssignedBy;
  /** Becomes the lead's first timeline note. */
  note: string | null;
  createdBy: string | null;
  /** Now unless given. */
  createdAt?: Date;
  /** Where the lead came from, kept in the audit entry (the website form's id). */
  auditDetail?: EnquiryAuditDetail;
  /** When the timeline says it happened: the lead's created date unless given (an import's rows say the import's). */
  recordedAt?: Date;
}

/**
 * Writes a lead: the row, "created" on its timeline, the note, and "reassigned" when someone other than the actor owns
 * it (R36); one lead.added audit entry and lead.created. Nobody is notified here: the form tells a new owner, the
 * demo tells no one.
 */
export async function addLeadInTransaction(
  tx: OrgTx,
  actor: Actor,
  record: NewLeadRecord,
  now: Date,
): Promise<{ leadId: string; personId: string }> {
  const createdAt = record.createdAt ?? now;
  const recordedAt = record.recordedAt ?? createdAt;
  const stage = record.stage ?? "new";
  const { id: leadId } = await tx.lead.create({
    data: {
      personId: record.personId,
      stage,
      stageChangedAt: createdAt,
      returning: record.returning,
      ownerUserId: record.ownerUserId,
      ...tripColumns(record.trip),
      source: record.source,
      sourceDetail: record.sourceDetail,
      createdBy: record.createdBy,
      createdAt,
    },
    select: { id: true },
  });
  await recordLeadEvent(tx, actor, {
    leadId,
    kind: "created",
    occurredAt: recordedAt,
    ...(record.assignedBy ? { assignedBy: record.assignedBy, ownerUserId: record.ownerUserId } : {}),
  });
  if (record.note !== null) {
    const note = await tx.leadNote.create({
      data: { leadId, body: record.note, createdBy: record.createdBy, createdAt: recordedAt },
      select: { id: true },
    });
    const noted = { recordType: "lead_note", recordId: note.id } as const;
    await recordLeadEvent(tx, actor, { leadId, kind: "note", record: noted, occurredAt: recordedAt });
  }
  if (record.ownerUserId !== null && record.ownerUserId !== actor.userId) {
    await recordLeadEvent(tx, actor, {
      leadId,
      kind: "reassigned",
      ownerUserId: record.ownerUserId,
      occurredAt: recordedAt,
    });
  }
  await recordCrmAudit(tx, actor, {
    action: "lead.added",
    entityType: "lead",
    entityId: leadId,
    after: {
      stage,
      ownerUserId: record.ownerUserId,
      source: record.source,
      ...(record.assignedBy ? { assignedBy: record.assignedBy } : {}),
      ...record.auditDetail,
    },
  });
  await publishEvent(tx, { type: "lead.created", payload: { leadId, personId: record.personId } });
  return { leadId, personId: record.personId };
}
