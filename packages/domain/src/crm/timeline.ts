// A lead's timeline and its notes (spec 3.4): what happened, newest first a page at a time, each entry with the note,
// repeat enquiry or task it points to; and a note added to it. A note's text is never copied into the audit log (R28);
// nothing listens to notes yet, so adding one publishes no event (P5).
import { bookingEvent } from "@travel-crm/contracts/bookings";
import {
  assignmentReason,
  callOutcome,
  leadEventKind,
  leadSource,
  leadStage,
  type AddNoteInput,
  type TimelineEntry,
  type TimelineInput,
  type TimelinePage,
} from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { destinationNames } from "../catalog/index.js";
import type { MemberAccess } from "../identity/index.js";
import { listTasksOnRecord } from "../tasks/index.js";
import { recordCrmAudit } from "./crm-audit.js";
import { findLeadInScope } from "./lead-detail.js";
import { recordLeadEvent } from "./lead-events.js";
import { tripColumnNames, tripDetailOf } from "./trip-columns.js";

interface EntryRow {
  id: string;
  kind: string;
  occurredAt: Date;
  actorUserId: string | null;
  recordType: string | null;
  recordId: string | null;
  stage: string | null;
  ownerUserId: string | null;
  assignmentReason: string | null;
  assignmentRulePosition: number | null;
  assignmentAway: boolean;
  bookingEvent: string | null;
}

/** The notes, calls, repeat enquiries and tasks a page of the lead's entries points to, by id. */
async function pointedAt(tx: OrgTx, leadId: string, rows: readonly EntryRow[]) {
  const idsOf = (recordType: string) =>
    rows.flatMap((row) => (row.recordType === recordType && row.recordId !== null ? [row.recordId] : []));
  const notes = await tx.leadNote.findMany({
    where: { id: { in: idsOf("lead_note") } },
    select: { id: true, body: true },
  });
  const calls = await tx.leadCall.findMany({
    where: { id: { in: idsOf("lead_call") } },
    select: { id: true, outcome: true, note: true },
  });
  const enquiries = await tx.leadEnquiry.findMany({
    where: { id: { in: idsOf("lead_enquiry") } },
    select: { id: true, source: true, sourceDetail: true, note: true, ...tripColumnNames },
  });
  const names = await destinationNames(
    tx,
    enquiries.flatMap((enquiry) => (enquiry.destinationId === null ? [] : [enquiry.destinationId])),
  );
  const bookings = await tx.booking.findMany({
    where: { id: { in: idsOf("booking") } },
    select: { id: true, number: true },
  });
  // Done and cancelled tasks too: the timeline tells what happened to them. Its tasks are all on the lead (a follow-up
  // stays on its lead whoever owns it), read through the tasks module, which alone reads the task table.
  const taskIds = new Set(idsOf("task"));
  const tasks =
    taskIds.size === 0 ? [] : (await listTasksOnRecord(tx, "lead", [leadId])).filter((task) => taskIds.has(task.id));
  return {
    notes: new Map(notes.map((note) => [note.id, note.body])),
    calls: new Map(calls.map((call) => [call.id, { outcome: callOutcome.parse(call.outcome), note: call.note }])),
    enquiries: new Map(
      enquiries.map((enquiry) => [
        enquiry.id,
        {
          source: leadSource.parse(enquiry.source),
          sourceDetail: enquiry.sourceDetail,
          note: enquiry.note,
          trip: tripDetailOf(enquiry, names),
        },
      ]),
    ),
    tasks: new Map(tasks.map((task) => [task.id, { kind: task.kind, title: task.title, dueAt: task.dueAt }])),
    bookings: new Map(bookings.map((booking) => [booking.id, booking.number])),
  };
}

/** One entry as the page shows it; null when what it points to is gone (an erasure removes notes and enquiries). */
function entryOf(
  row: EntryRow,
  leadSourceValue: string,
  pointed: Awaited<ReturnType<typeof pointedAt>>,
): TimelineEntry | null {
  const base = { id: row.id, occurredAt: row.occurredAt.toISOString(), actorUserId: row.actorUserId };
  const target = row.recordId ?? "";
  const kind = leadEventKind.parse(row.kind);
  switch (kind) {
    case "created":
      return {
        ...base,
        kind,
        source: leadSource.parse(leadSourceValue),
        assignment:
          row.assignmentReason === null
            ? null
            : {
                ownerUserId: row.ownerUserId,
                reason: assignmentReason.parse(row.assignmentReason),
                rulePosition: row.assignmentRulePosition,
                away: row.assignmentAway,
              },
      };
    case "note": {
      const body = pointed.notes.get(target);
      return body === undefined ? null : { ...base, kind, body };
    }
    case "call": {
      const call = pointed.calls.get(target);
      return call === undefined ? null : { ...base, kind, callId: target, ...call };
    }
    case "stage-changed":
      return row.stage === null ? null : { ...base, kind, stage: leadStage.parse(row.stage) };
    case "reassigned":
      return { ...base, kind, ownerUserId: row.ownerUserId };
    case "follow-up-added":
    case "follow-up-done":
    case "follow-up-cancelled": {
      const task = pointed.tasks.get(target);
      return task === undefined ? null : { ...base, kind, task };
    }
    case "repeat-enquiry": {
      const enquiry = pointed.enquiries.get(target);
      return enquiry === undefined ? null : { ...base, kind, enquiry };
    }
    case "trip-edited":
    case "whatsapp-contact":
      return { ...base, kind };
    case "booking-event": {
      const number = pointed.bookings.get(target);
      return number === undefined || row.bookingEvent === null
        ? null
        : { ...base, kind, bookingId: target, number, event: bookingEvent.parse(row.bookingEvent) };
    }
  }
}

/** One page of the timeline, newest first; the router adds the names. */
export async function listLeadTimeline(
  tx: OrgTx,
  access: MemberAccess,
  input: TimelineInput,
): Promise<Omit<TimelinePage, "people">> {
  const lead = await findLeadInScope(tx, access, input.leadId);
  // One more than a page tells whether another page follows.
  const rows = await tx.leadTimelineEntry.findMany({
    where: { leadId: lead.id, ...(input.before === undefined ? {} : { id: { lt: input.before } }) },
    orderBy: { id: "desc" },
    take: input.limit + 1,
    select: {
      id: true,
      kind: true,
      occurredAt: true,
      actorUserId: true,
      recordType: true,
      recordId: true,
      stage: true,
      ownerUserId: true,
      assignmentReason: true,
      assignmentRulePosition: true,
      assignmentAway: true,
      bookingEvent: true,
    },
  });
  const page = rows.slice(0, input.limit);
  const pointed = await pointedAt(tx, lead.id, page);
  return {
    entries: page.flatMap((row) => entryOf(row, lead.source, pointed) ?? []),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** A lead's note as the WhatsApp chat shows it among the messages. */
export interface LeadNoteRow {
  id: string;
  body: string;
  createdBy: string | null;
  createdAt: Date;
}

/**
 * The notes a person wrote on the lead, newest first, at most `take`; the one the system makes from a customer's first words
 * (no writer) is left out, since the chat shows those words itself. The caller has checked that the member may see the lead.
 */
export async function listLeadNotes(tx: OrgTx, leadId: string, take: number): Promise<LeadNoteRow[]> {
  return tx.leadNote.findMany({
    where: { leadId, createdBy: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: { id: true, body: true, createdBy: true, createdAt: true },
  });
}

/** Adds a note to the lead's timeline, audited without its text. */
export async function addLeadNote(tx: OrgTx, access: MemberAccess, input: AddNoteInput): Promise<LeadNoteRow> {
  const lead = await findLeadInScope(tx, access, input.leadId);
  const note = await tx.leadNote.create({
    data: { leadId: lead.id, body: input.body, createdBy: access.userId },
    select: { id: true, body: true, createdBy: true, createdAt: true },
  });
  await recordLeadEvent(tx, access, {
    leadId: lead.id,
    kind: "note",
    record: { recordType: "lead_note", recordId: note.id },
  });
  await recordCrmAudit(tx, access, {
    action: "lead.note-added",
    entityType: "lead",
    entityId: lead.id,
    after: { recordId: note.id },
  });
  return note;
}
