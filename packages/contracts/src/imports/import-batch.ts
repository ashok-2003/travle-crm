// An import as a whole (spec 5, 6.5): its kinds, statuses and limits, why it may end early, the file it starts with,
// and what its page and Recent imports show of it.
import { z } from "zod";
import { budgetBasis } from "../crm/fields.js";
import { leadImportStage } from "../crm/lead-import.js";
import {
  attachmentFileName,
  MAX_IMPORT_BYTES,
  presignedUpload,
  spreadsheetContentTypes,
} from "../files/attachments.js";
import { recordId, roleKey } from "../identity/fields.js";
import { importColumn, valueMatch } from "./import-columns.js";
import { rowOutcome, rowPlan, rowReasonCode } from "./import-rows.js";

export const importKinds = ["leads", "staff"] as const;
export const importKind = z.enum(importKinds);
export type ImportKind = z.infer<typeof importKind>;

export const importStatuses = [
  "uploading",
  "reading",
  "unreadable",
  "matching",
  "checking",
  "checked",
  "adding",
  "done",
  "stopped",
  "failed",
  "cancelled",
  "expired",
] as const;
export const importStatus = z.enum(importStatuses);
export type ImportStatus = z.infer<typeof importStatus>;

/** The statuses an import waits at a step in: it may still be cancelled. */
export const waitingImportStatuses = ["uploading", "reading", "matching", "checking", "checked"] as const;

/** The most data rows a file of each kind may have (B2). */
export const importRowLimits: Readonly<Record<ImportKind, number>> = { leads: 10_000, staff: 500 };
export const MAX_IMPORT_COLUMNS = 50;
export const MAX_CELL_LENGTH = 4000;
export { MAX_LISTED_VALUES } from "./listed-values.js";

/** Why a file can't be read (B5): the spreadsheets port's eight. A domain test holds the two lists equal. */
export const unreadableReasons = [
  "not_a_spreadsheet",
  "protected",
  "old_excel",
  "no_column_names",
  "no_rows",
  "too_many_rows",
  "too_many_columns",
  "too_large_unpacked",
] as const;
export const unreadableReason = z.enum(unreadableReasons);
export type UnreadableReason = z.infer<typeof unreadableReason>;

/** Why an add stopped before its end (B31, D24): the importer's access, the file, or a staff row that changed. */
export const importFailureReasons = [
  "no_longer_a_member",
  "lost_permission",
  "organization_cannot_change",
  "file_withdrawn",
  "row_changed",
  "over_seat_limit",
] as const;
export const importFailureReason = z.enum(importFailureReasons);
export type ImportFailureReason = z.infer<typeof importFailureReason>;

/** The file an import starts with: its name, CSV or .xlsx by its extension (the web decides), and its size. */
export const startImportInput = z.strictObject({
  fileName: attachmentFileName,
  contentType: z.enum(spreadsheetContentTypes),
  sizeBytes: z.int().min(1).max(MAX_IMPORT_BYTES),
});
export type StartImportInput = z.infer<typeof startImportInput>;

export const importIdInput = z.strictObject({ importId: recordId });
export type ImportIdInput = z.infer<typeof importIdInput>;

export const startedImport = z.object({ importId: recordId, attachmentId: recordId, upload: presignedUpload });
export type StartedImport = z.infer<typeof startedImport>;

/** What the check found, for the preview, and what the add did. */
export const importCounts = z.object({
  /** Every plan's rows: an enum's record holds each key. */
  byPlan: z.record(rowPlan, z.int()),
  /** How many of the new leads are returning customers'. */
  returning: z.int(),
  /** Rows added with a value kept in the note (B21). */
  noted: z.int(),
  /** Leads that will be New, for the quiet line. */
  newStage: z.int(),
  /** The rows not added, by their first reason. */
  notAdded: z.array(z.object({ reason: rowReasonCode, rows: z.int() })),
  /** A sheet's rows for people who already have a lead (plan in_crm), by whether one is open; zero for a file. */
  inCrm: z.object({ open: z.int(), closed: z.int() }),
  /** Destinations the import adds to the agency's list. */
  newDestinations: z.array(z.string()),
  outcomes: z.record(rowOutcome, z.int()),
});
export type ImportCounts = z.infer<typeof importCounts>;

export const importDetail = z.object({
  id: recordId,
  kind: importKind,
  status: importStatus,
  fileName: z.string(),
  fileKind: z.enum(["csv", "xlsx"]),
  /** A workbook's first sheet and how many it has; null for a CSV or before it is read. */
  sheet: z.object({ name: z.string(), count: z.int() }).nullable(),
  unreadableReason: unreadableReason.nullable(),
  failureReason: importFailureReason.nullable(),
  /** An earlier import of the agency had the same file and added rows (B6). */
  sameFile: z.object({ importedAt: z.iso.datetime(), rowsAdded: z.int() }).nullable(),
  columns: z.array(importColumn),
  valueMatches: z.array(valueMatch),
  defaults: z.object({
    stage: leadImportStage,
    ownerUserId: recordId.nullable(),
    budgetBasis: budgetBasis.nullable(),
    roleKey: roleKey.nullable(),
  }),
  choices: z.object({ addBlocked: z.boolean(), addAlreadyImported: z.boolean(), addInCrm: z.boolean() }),
  /** The Google Sheet connection the import reads (the Sheets sync's connect-time import); null for a file. */
  sourceSheet: z.object({ sheetId: recordId }).nullable(),
  /**
   * The Meta lead form whose last 30 days of leads the import reads; null otherwise. Like a sheet's import it reads
   * its rows' contacts against the CRM, so the preview offers the "Already in your CRM" group.
   */
  sourceMetaForm: z.object({ formId: recordId }).nullable(),
  /** Null until the check has run. */
  counts: importCounts.nullable(),
  progress: z.object({
    rowsTotal: z.int(),
    rowsToAdd: z.int(),
    rowsDone: z.int(),
    rowsAdded: z.int(),
    addRequestedAt: z.iso.datetime().nullable(),
  }),
  createdAt: z.iso.datetime(),
  checkedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  /** When its file and report are deleted, and what it keeps of the rows emptied (B53). */
  keepUntil: z.iso.datetime(),
  /** The report of rows not added, once the add ended (B34). */
  report: z.object({ fileName: z.string(), sizeBytes: z.int() }).nullable(),
});
export type ImportDetail = z.infer<typeof importDetail>;

export const recentImport = z.object({
  id: recordId,
  fileName: z.string(),
  createdAt: z.iso.datetime(),
  status: importStatus,
  rowsTotal: z.int(),
  rowsAdded: z.int(),
});
export type RecentImport = z.infer<typeof recentImport>;
