// Inputs and outputs of the audit log (spec 9.5): the entries the audit log viewer (plan 5) lists.
import { z } from "zod";
import { recordId } from "../identity/index.js";

/** Where a change came from. The database's audit_entry_source_value check holds the same values. */
export const auditSource = z.enum(["web", "api", "job", "impersonation"]);
export type AuditSource = z.infer<typeof auditSource>;

/** A kind of record, e.g. "member" or "role". Matches the database's audit_entry_entity_type_format check. */
export const auditEntityType = z.string().regex(/^[a-z][a-z_]{1,39}$/, "Use lower-case letters and underscores");

/** The fields that changed on one side of a change, or null when there is no state on that side. */
const auditSnapshot = z.record(z.string(), z.unknown()).nullable();

export const auditEntry = z.object({
  id: recordId,
  occurredAt: z.iso.datetime(),
  /** The person who acted, or null for the system. */
  actorUserId: recordId.nullable(),
  source: auditSource,
  /** The platform admin while support was impersonating; set exactly when source is "impersonation". */
  impersonatedBy: recordId.nullable(),
  /** "<entity>.<what happened>", e.g. "staff.removed". */
  action: z.string(),
  entityType: z.string(),
  entityId: recordId,
  before: auditSnapshot,
  after: auditSnapshot,
});
export type AuditEntry = z.infer<typeof auditEntry>;

/** One page of the log, newest first. Filter by one record with both entityType and entityId. */
export const listAuditEntriesInput = z
  .strictObject({
    entityType: auditEntityType.optional(),
    entityId: recordId.optional(),
    /** The id of the last entry of the previous page. */
    before: recordId.optional(),
    limit: z.int().min(1).max(100).default(50),
  })
  .refine((input) => (input.entityType === undefined) === (input.entityId === undefined), {
    message: "Give both entityType and entityId, or neither",
    path: ["entityId"],
  });
export type ListAuditEntriesInput = z.infer<typeof listAuditEntriesInput>;

export const auditEntryPage = z.object({
  entries: z.array(auditEntry),
  /** Pass as `before` for the next page; null on the last page. */
  nextCursor: recordId.nullable(),
});
export type AuditEntryPage = z.infer<typeof auditEntryPage>;
