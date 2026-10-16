// A customer's erasure and export (spec 7, ADR 0023, R38, R39): crm's part of erasing a "person" record on a DPDP
// request, and the export the console shows before it. The erasure runs on the platform's transaction, naming the
// organization in every query, since it deletes rows the runtime role may not (timeline entries, blocked contacts,
// R7); the export only reads, in the organization's own transaction. The platform's erasure adds the rest: the
// person's audit entries, and their leads' tasks, notifications and files.
import { leadSource, leadStage } from "@travel-crm/contracts/crm";
import type { CustomerExport } from "@travel-crm/contracts/platform";
import { joinSql, sql, withDeleted, type OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import { listTasksOnRecord } from "../tasks/index.js";
import { tripDetailColumns, tripDetailOf } from "./trip-record.js";

/** The person an erasure or export is about, in the organization it names. */
export interface CustomerSubject {
  organizationId: string;
  personId: string;
}

/** What the erasure removed, for the platform's log: counts and the leads' ids, never their contents. */
export interface ErasedCustomer {
  leadIds: string[];
  notes: number;
  enquiries: number;
  timelineEntries: number;
  blockedContacts: number;
}

/**
 * Empties the person's name and contacts, marks them erased and soft-deletes them and their leads, whose trip facts
 * stay for later reports but whose source detail (free text, which may name people) goes. Deletes their leads' notes
 * and repeat enquiries with those rows' timeline entries, and every blocked contact, live or unblocked, that holds
 * their phone, email or handle. Erased people and deleted leads are included, so a repeat finishes what is left; a
 * person the organization doesn't have changes nothing.
 */
export async function eraseCustomer(tx: OrgTx, subject: CustomerSubject): Promise<ErasedCustomer> {
  const { organizationId, personId } = subject;
  const now = new Date();
  return withDeleted(async () => {
    const person = await tx.person.findFirst({
      where: { organizationId, id: personId },
      select: { phoneE164: true, email: true, instagramHandle: true, erasedAt: true },
    });
    if (person === null) return { leadIds: [], notes: 0, enquiries: 0, timelineEntries: 0, blockedContacts: 0 };
    const leads = await tx.lead.findMany({
      where: { organizationId, personId },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const leadIds = leads.map((lead) => lead.id);
    const ofLeads = { organizationId, leadId: { in: leadIds } };
    const timelineEntries = await tx.leadTimelineEntry.deleteMany({
      where: { ...ofLeads, recordType: { in: ["lead_note", "lead_enquiry"] } },
    });
    const notes = await tx.leadNote.deleteMany({ where: ofLeads });
    const enquiries = await tx.leadEnquiry.deleteMany({ where: ofLeads });
    const held = [
      ["phone", person.phoneE164],
      ["email", person.email],
      ["instagram", person.instagramHandle],
    ].flatMap(([kind, value]) => (value === null ? [] : [sql`(kind = ${kind} AND value = ${value})`]));
    // A plain DELETE: soft delete refuses Prisma's, and only the platform role may delete these rows.
    const blockedContacts =
      held.length === 0
        ? 0
        : await tx.$executeRaw(sql`
            DELETE FROM blocked_contact
            WHERE organization_id = ${organizationId}::uuid AND (${joinSql(held, " OR ")})`);
    await tx.lead.updateMany({ where: { organizationId, personId }, data: { sourceDetail: null } });
    await tx.lead.updateMany({ where: { organizationId, personId, deletedAt: null }, data: { deletedAt: now } });
    const emptied = { name: "", phoneE164: null, email: null, instagramHandle: null, erasedAt: person.erasedAt ?? now };
    await tx.person.updateMany({ where: { organizationId, id: personId }, data: emptied });
    await tx.person.updateMany({ where: { organizationId, id: personId, deletedAt: null }, data: { deletedAt: now } });
    return {
      leadIds,
      notes: notes.count,
      enquiries: enquiries.count,
      timelineEntries: timelineEntries.count,
      blockedContacts,
    };
  });
}

/**
 * Everything kept about the customer, for them before an erasure (R39): their contacts, and each lead's stage, trip
 * and source with its notes, repeat enquiries and tasks (titles included). Run it in the organization's transaction
 * (forOrg, or asOrganization in the console). NOT_FOUND for a person the organization doesn't have.
 */
export async function exportCustomer(tx: OrgTx, subject: CustomerSubject): Promise<CustomerExport> {
  const { organizationId, personId } = subject;
  return withDeleted(async () => {
    const person = await tx.person.findFirst({
      where: { organizationId, id: personId },
      select: { name: true, phoneE164: true, email: true, instagramHandle: true },
    });
    if (person === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such person in this organization");
    const leads = await tx.lead.findMany({
      where: { organizationId, personId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        stage: true,
        source: true,
        sourceDetail: true,
        createdAt: true,
        ...tripDetailColumns,
        notes: { select: { body: true, createdAt: true }, orderBy: { id: "asc" } },
        enquiries: {
          select: { ...tripDetailColumns, source: true, sourceDetail: true, note: true, createdAt: true },
          orderBy: { id: "asc" },
        },
      },
    });
    const tasks = await listTasksOnRecord(
      tx,
      "lead",
      leads.map((lead) => lead.id),
    );
    return {
      personId,
      name: person.name,
      phone: person.phoneE164,
      email: person.email,
      instagramHandle: person.instagramHandle,
      leads: leads.map((lead) => ({
        leadId: lead.id,
        stage: leadStage.parse(lead.stage),
        source: leadSource.parse(lead.source),
        sourceDetail: lead.sourceDetail,
        createdAt: lead.createdAt.toISOString(),
        trip: tripDetailOf(lead),
        notes: lead.notes.map((note) => ({ body: note.body, createdAt: note.createdAt.toISOString() })),
        enquiries: lead.enquiries.map((enquiry) => ({
          trip: tripDetailOf(enquiry),
          source: leadSource.parse(enquiry.source),
          sourceDetail: enquiry.sourceDetail,
          note: enquiry.note,
          createdAt: enquiry.createdAt.toISOString(),
        })),
        tasks: tasks
          .filter((task) => task.record?.recordId === lead.id)
          .map(({ kind, title, dueAt, doneAt, cancelledAt }) => ({ kind, title, dueAt, doneAt, cancelledAt })),
      })),
    };
  });
}
