// Permanent deletion from the console (spec 5): an export first, then a typed confirmation, then a job, for a whole
// organization or for one person or record on a DPDP erasure request. Super admins only. An organization's export is
// itself a job, which stores the export for 7 days; the console fetches short-lived links to it.
import { z } from "zod";
import { auditEntityType, auditEntry } from "../audit/index.js";
import { leadSource, leadStage } from "../crm/fields.js";
import { tripDetail } from "../crm/trip.js";
import { recordId } from "../identity/index.js";
import { taskKind } from "../tasks/tasks.js";

/** Who or what an erasure is about: a removed member, or one record of a module (a traveller, later). */
export const erasureSubject = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("member"), memberId: recordId }),
  z
    .strictObject({ kind: z.literal("record"), recordType: auditEntityType, recordId })
    .refine((subject) => subject.recordType !== "member", {
      message: "Erase a member as a member",
      path: ["recordType"],
    }),
]);
export type ErasureSubject = z.infer<typeof erasureSubject>;

export const exportedFile = z.object({
  id: recordId,
  recordType: z.string(),
  recordId: recordId,
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.int(),
  sensitive: z.boolean(),
  deleted: z.boolean(),
  /** Works for about 15 minutes; null for an upload that never finished. */
  downloadUrl: z.string().nullable(),
});

export const exportedPerson = z.object({
  memberId: recordId,
  userId: recordId,
  name: z.string(),
  email: z.string().nullable(),
  username: z.string().nullable(),
  role: z.string(),
  joinedAt: z.iso.datetime(),
  removedAt: z.iso.datetime().nullable(),
});

export const exportOrganizationInput = z.strictObject({ organizationId: recordId });
export type ExportOrganizationInput = z.infer<typeof exportOrganizationInput>;

/** requested (queued or running), done, failed (its last attempt failed), or expired (its parts deleted). */
export const organizationExportState = z.enum(["requested", "done", "failed", "expired"]);

/**
 * One export of everything the organization keeps, for it to take away before a purge: its tables' rows and its
 * people, as JSON lines in parts, kept by the platform for 7 days (it outlives a purge).
 */
export const organizationExport = z.object({
  exportId: recordId,
  organizationId: recordId,
  state: organizationExportState,
  requestedBy: recordId,
  requestedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  /** When its parts are deleted: 7 days after it was asked for. */
  expiresAt: z.iso.datetime(),
  /** Once done: its parts, the table rows and people they hold, and the files it copied. */
  parts: z.int().nullable(),
  rows: z.int().nullable(),
  people: z.int().nullable(),
  files: z.int().nullable(),
});
export type OrganizationExport = z.infer<typeof organizationExport>;

export const exportIdInput = z.strictObject({ exportId: recordId });
export type ExportIdInput = z.infer<typeof exportIdInput>;

/**
 * Links to a done export, each working for about 15 minutes. Each part holds lines of `{"table", "row"}` (every table
 * of the organization's) and `{"person"}` (its people's sign-in names and addresses). Each file is the export's own
 * copy, so it outlives a purge; its link saves it under its id (`fileId`), which the attachment rows name.
 */
export const organizationExportDownload = z.object({
  exportId: recordId,
  linksExpireAt: z.iso.datetime(),
  parts: z.array(z.object({ part: z.int(), url: z.string() })),
  files: z.array(z.object({ fileId: recordId, url: z.string() })),
});
export type OrganizationExportDownload = z.infer<typeof organizationExportDownload>;

export const exportSubjectInput = z.strictObject({ organizationId: recordId, subject: erasureSubject });
export type ExportSubjectInput = z.infer<typeof exportSubjectInput>;

/** One of a customer's leads as the export gives it: its stage, trip and source, and what was written on it. */
export const exportedLead = z.object({
  leadId: recordId,
  stage: leadStage,
  source: leadSource,
  sourceDetail: z.string().nullable(),
  createdAt: z.iso.datetime(),
  trip: tripDetail,
  notes: z.array(z.object({ body: z.string(), createdAt: z.iso.datetime() })),
  /** Repeat enquiries added to the lead, each as the customer asked it. */
  enquiries: z.array(
    z.object({
      trip: tripDetail,
      source: leadSource,
      sourceDetail: z.string().nullable(),
      note: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
  /** Its follow-ups and tasks, done and cancelled ones too, earliest due first. */
  tasks: z.array(
    z.object({
      kind: taskKind,
      title: z.string(),
      dueAt: z.iso.datetime(),
      doneAt: z.iso.datetime().nullable(),
      cancelledAt: z.iso.datetime().nullable(),
    }),
  ),
});
export type ExportedLead = z.infer<typeof exportedLead>;

/** What the organization keeps about one customer (a "person" record, R39): their contacts and every lead of theirs. */
export const customerExport = z.object({
  personId: recordId,
  /** Empty once erased. */
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  instagramHandle: z.string().nullable(),
  leads: z.array(exportedLead),
});
export type CustomerExport = z.infer<typeof customerExport>;

/** What the organization keeps about one person or record, for the person before an erasure. */
export const subjectExport = z.object({
  exportedAt: z.iso.datetime(),
  person: exportedPerson.nullable(),
  /** A customer's contacts and leads, for a "person" record; null for anything else. */
  customer: customerExport.nullable(),
  auditEntries: z.array(auditEntry),
  files: z.array(exportedFile),
});
export type SubjectExport = z.infer<typeof subjectExport>;

/** The typed confirmation is the organization's code. */
export const requestPurgeInput = z.strictObject({ organizationId: recordId, confirmation: z.string().max(20) });
export type RequestPurgeInput = z.infer<typeof requestPurgeInput>;

export const requestErasureInput = z.strictObject({
  organizationId: recordId,
  subject: erasureSubject,
  confirmation: z.string().max(20),
});
export type RequestErasureInput = z.infer<typeof requestErasureInput>;

export const queuedJob = z.object({ jobId: recordId });
export type QueuedJob = z.infer<typeof queuedJob>;
