// An export of leads or staff (spec 5, 6.5, B37-B42): its kinds, formats and statuses, why it may fail, how it is
// asked for and followed, and the event the worker makes its file on.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const exportKinds = ["leads", "staff"] as const;
export const exportKind = z.enum(exportKinds);
export type ExportKind = z.infer<typeof exportKind>;

/** Excel is the default (B39): typed cells, and a phone without a visible apostrophe. */
export const exportFormats = ["xlsx", "csv"] as const;
export const exportFormat = z.enum(exportFormats);
export type ExportFormat = z.infer<typeof exportFormat>;

export const exportStatuses = ["making", "ready", "failed", "expired"] as const;
export const exportStatus = z.enum(exportStatuses);
export type ExportStatus = z.infer<typeof exportStatus>;

/** Why an export failed: the requester's access when the job started (B41), or too many rows (B37). */
export const exportFailureReasons = ["no_longer_a_member", "lost_permission", "too_many_rows"] as const;
export const exportFailureReason = z.enum(exportFailureReasons);
export type ExportFailureReason = z.infer<typeof exportFailureReason>;

export const exportIdInput = z.strictObject({ exportId: recordId });
export type ExportIdInput = z.infer<typeof exportIdInput>;

export const startedExport = z.object({ exportId: recordId });
export type StartedExport = z.infer<typeof startedExport>;

/** The staff export has no filter: the active staff, oldest first (B52). */
export const startStaffExportInput = z.strictObject({ format: exportFormat });
export type StartStaffExportInput = z.infer<typeof startStaffExportInput>;

export const exportDetail = z.object({
  id: recordId,
  kind: exportKind,
  format: exportFormat,
  status: exportStatus,
  failureReason: exportFailureReason.nullable(),
  rowsTotal: z.int(),
  rowsDone: z.int(),
  /** The file once it is ready, until it is deleted. */
  file: z.object({ fileName: z.string(), sizeBytes: z.int() }).nullable(),
  createdAt: z.iso.datetime(),
  readyAt: z.iso.datetime().nullable(),
  /** 24 hours after it was ready (B42). */
  expiresAt: z.iso.datetime().nullable(),
});
export type ExportDetail = z.infer<typeof exportDetail>;

/** export.requested and export.made: ids and the kind, never the filter. */
export const exportRequestedEvent = z.strictObject({ exportId: recordId, kind: exportKind });
export type ExportRequestedEvent = z.infer<typeof exportRequestedEvent>;
