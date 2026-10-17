// Adding a lead by hand (spec 3.2, 4): a new person or a known one, a repeat enquiry on their open lead or a new trip
// marked returning, and the owner the form names (R14). A person found by a contact keeps their stored name and gains
// the contacts they lack (R32). The form must choose before anything goes on an open lead (R24).
import type { CreatedLead, CreateLeadInput, LeadSource, LeadStage } from "@travel-crm/contracts/crm";
import { isUniqueViolation, type Database, type OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { recordCrmAudit } from "./crm-audit.js";
import { notifyLeadAssigned } from "./lead-core.js";
import { isLeadInScope } from "./lead-detail.js";
import { recordLeadEvent } from "./lead-events.js";
import { addPerson, fillMissingContacts, matchPerson, newestOpenLead } from "./people.js";
import { addRepeatEnquiry } from "./repeat-enquiry.js";
import { resolveTrip, tripColumns, type TripRecord } from "./trip-columns.js";

/** A lead as it is written: the person and the destination already found or added. */
export interface NewLeadRecord {
  personId: string;
  trip: TripRecord;
  /** New unless given (the demo's leads are in every stage). */
  stage?: LeadStage;
  returning: boolean;
  ownerUserId: string;
  source: LeadSource;
  sourceDetail: string | null;
  /** Becomes the lead's first timeline note. */
  note: string | null;
  createdBy: string | null;
  /** Now unless given. */
  createdAt?: Date;
}

/**
 * Adds the lead, or the enquiry to the person's open lead. Takes the database, not a transaction: a save that races
 * another for the same new contact reruns once in a new transaction (R23), where it finds the person the other save
 * added and asks about their open lead. `owners` are the lead workers (R14), needed only for another owner.
 */
export async function createLead(
  database: Database,
  access: MemberAccess,
  input: CreateLeadInput,
  context: { owners: ReadonlySet<string>; now: Date },
): Promise<CreatedLead> {
  const ownerUserId = input.ownerUserId ?? access.userId;
  if (ownerUserId !== access.userId) {
    if (!access.permissions.has("leads:assign")) {
      throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires leads:assign");
    }
    if (!context.owners.has(ownerUserId)) {
      throw new DomainError("VALIDATION", "NOT_A_LEAD_WORKER", "That person can't work leads");
    }
  }
  const save = () =>
    database.forOrg(access.organizationId, (tx) => saveLead(tx, access, input, ownerUserId, context.now));
  try {
    return await save();
  } catch (error) {
    // Postgres aborted the transaction on the duplicate contact, so the second look needs a transaction of its own.
    if (!isUniqueViolation(error)) throw error;
    return save();
  }
}

async function saveLead(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateLeadInput,
  ownerUserId: string,
  now: Date,
): Promise<CreatedLead> {
  const found = await matchPerson(tx, input.person);
  if (found !== null) {
    await fillMissingContacts(tx, access, found.person, input.person);
    const open = await newestOpenLead(tx, found.person.id);
    if (open !== null && input.whenOpenLead === null) {
      throw new DomainError("CONFLICT", "OPEN_LEAD_EXISTS", "This person already has an open lead");
    }
    if (open !== null && input.whenOpenLead === "add-to-it") {
      return addRepeatEnquiry(tx, access, { lead: open, personName: found.person.name, input }, now);
    }
  }
  const person = found?.person ?? (await addPerson(tx, access, input.person));
  const trip = await resolveTrip(tx, access, input.trip);
  const returning = found !== null && (await tx.lead.count({ where: { personId: person.id } })) > 0;
  const { leadId } = await addLeadInTransaction(
    tx,
    access,
    {
      personId: person.id,
      trip,
      returning,
      ownerUserId,
      source: input.source,
      sourceDetail: input.sourceDetail,
      note: input.note,
      createdBy: access.userId,
    },
    now,
  );
  if (ownerUserId !== access.userId) await notifyLeadAssigned(tx, access, { leadId, ownerUserId });
  return { outcome: "created", leadId: isLeadInScope(access, ownerUserId) ? leadId : null, returning };
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
  await recordLeadEvent(tx, actor, { leadId, kind: "created", occurredAt: createdAt });
  if (record.note !== null) {
    const note = await tx.leadNote.create({
      data: { leadId, body: record.note, createdBy: record.createdBy, createdAt },
      select: { id: true },
    });
    const noted = { recordType: "lead_note", recordId: note.id } as const;
    await recordLeadEvent(tx, actor, { leadId, kind: "note", record: noted, occurredAt: createdAt });
  }
  if (record.ownerUserId !== actor.userId) {
    await recordLeadEvent(tx, actor, {
      leadId,
      kind: "reassigned",
      ownerUserId: record.ownerUserId,
      occurredAt: createdAt,
    });
  }
  await recordCrmAudit(tx, actor, {
    action: "lead.added",
    entityType: "lead",
    entityId: leadId,
    after: { stage, ownerUserId: record.ownerUserId, source: record.source },
  });
  await publishEvent(tx, { type: "lead.created", payload: { leadId, personId: record.personId } });
  return { leadId, personId: record.personId };
}
