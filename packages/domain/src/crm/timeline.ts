// A lead's timeline and its notes (spec 3.4): what happened, newest first a page at a time, each entry with the note,
// repeat enquiry or task it points to; and a note added to it. A note's text is never copied into the audit log (R28);
// nothing listens to notes yet, so adding one publishes no event (P5).
import {
  leadEventKind,
  leadSource,
  leadStage,
  type AddNoteInput,
  type TimelineEntry,
  type TimelineInput,
  type TimelinePage,
} from "@travel-crm/contracts/crm";
import { taskKind } from "@travel-crm/contracts/tasks";
import type { OrgTx } from "@travel-crm/db";
import { destinationNames } from "../catalog/index.js";
import type { MemberAccess } from "../identity/index.js";
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
}

/** The notes, repeat enquiries and tasks a page of entries points to, by id. */
async function pointedAt(tx: OrgTx, rows: readonly EntryRow[]) {
  const idsOf = (recordType: string) =>
    rows.flatMap((row) => (row.recordType === recordType && row.recordId !== null ? [row.recordId] : []));
  const notes = await tx.leadNote.findMany({
    where: { id: { in: idsOf("lead_note") } },
    select: { id: true, body: true },
  });
  const enquiries = await tx.leadEnquiry.findMany({
    where: { id: { in: idsOf("lead_enquiry") } },
    select: { id: true, source: true, sourceDetail: true, note: true, ...tripColumnNames },
  });
  const names = await destinationNames(
    tx,
    enquiries.flatMap((enquiry) => (enquiry.destinationId === null ? [] : [enquiry.destinationId])),
  );
  // Done and cancelled tasks too, which the tasks module's reads leave out: the timeline tells what happened to them.
  const tasks = await tx.task.findMany({
    where: { id: { in: idsOf("task") } },
    select: { id: true, kind: true, title: true, dueAt: true },
  });
  return {
    notes: new Map(notes.map((note) => [note.id, note.body])),
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
    tasks: new Map(
      tasks.map((task) => [
        task.id,
        { kind: taskKind.parse(task.kind), title: task.title, dueAt: task.dueAt.toISOString() },
      ]),
    ),
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
      return { ...base, kind, source: leadSource.parse(leadSourceValue) };
    case "note": {
      const body = pointed.notes.get(target);
      return body === undefined ? null : { ...base, kind, body };
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
      return { ...base, kind };
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
    },
  });
  const page = rows.slice(0, input.limit);
  const pointed = await pointedAt(tx, page);
  return {
    entries: page.flatMap((row) => entryOf(row, lead.source, pointed) ?? []),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Adds a note to the lead's timeline, audited without its text. */
export async function addLeadNote(tx: OrgTx, access: MemberAccess, input: AddNoteInput): Promise<void> {
  const lead = await findLeadInScope(tx, access, input.leadId);
  const note = await tx.leadNote.create({
    data: { leadId: lead.id, body: input.body, createdBy: access.userId },
    select: { id: true },
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
}
