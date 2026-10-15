// Permanent deletion from the console (spec 5): an export first, then a typed confirmation, then a job, for a whole
// organization or for one person or record on a DPDP erasure request. Super admins only.
import { z } from "zod";
import { auditEntityType, auditEntry } from "../audit/index.js";
import { recordId } from "../identity/index.js";

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
  /** Works for 24 hours; null for an upload that never finished. */
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

/** Everything the organization keeps, for it to take away before a purge. */
export const organizationExport = z.object({
  exportedAt: z.iso.datetime(),
  organizationId: recordId,
  /** Each table's rows, by table name, as JSON. */
  tables: z.record(z.string(), z.array(z.unknown())),
  people: z.array(exportedPerson),
  files: z.array(exportedFile),
});
export type OrganizationExport = z.infer<typeof organizationExport>;

export const exportSubjectInput = z.strictObject({ organizationId: recordId, subject: erasureSubject });
export type ExportSubjectInput = z.infer<typeof exportSubjectInput>;

/** What the organization keeps about one person or record, for the person before an erasure. */
export const subjectExport = z.object({
  exportedAt: z.iso.datetime(),
  person: exportedPerson.nullable(),
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
