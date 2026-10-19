// The report of rows not added (B34, B35): the uploaded format, two first columns, "Why it wasn't added" (the first
// reason's sentence) and "Row" (its row in the file), then the file's own columns as they were, so the importer fixes
// the rows in Excel and uploads the report as it is. Stored as the system's file under the import's id, once.
import { spreadsheetContentTypes } from "@travel-crm/contracts/files";
import type { RowReasonCode } from "@travel-crm/contracts/imports";
import type { WriterColumn, WrittenCell } from "@travel-crm/integrations/spreadsheets";
import { IMPORT_REPORT_RECORD_TYPE } from "../files/index.js";
import { organizationTimeZone } from "../identity/index.js";
import type { ListenerContext } from "../jobs/index.js";
import { calendarDateIn } from "../kernel/index.js";
import type { ImportBatchRow } from "./batch-row.js";
import type { ImportJobDependencies } from "./dependencies.js";
import { readImportFile } from "./read-file.js";
import { reportSentence } from "./report-words.js";
import { decodeRowReason } from "./row-reasons.js";

const reportSuffix = " - rows not added";
/** The longest file name storage keeps (attachmentFileName). */
const MAX_FILE_NAME = 200;

/** "enquiries-oct-2026 - rows not added.xlsx": the file's name without its extension, cut so the whole fits. */
export function reportFileName(fileName: string, kind: "csv" | "xlsx"): string {
  const extension = `.${kind}`;
  const base = fileName.replace(/\.(csv|xlsx)$/i, "");
  return `${base.slice(0, MAX_FILE_NAME - reportSuffix.length - extension.length)}${reportSuffix}${extension}`;
}

export const reportContentType = (kind: "csv" | "xlsx") =>
  kind === "csv" ? spreadsheetContentTypes[0] : spreadsheetContentTypes[1];

/** A row the check gave no reason: what its plan says (a row left out), else the add never reached it. */
const reasonOfPlan: Readonly<Partial<Record<string, RowReasonCode>>> = {
  blocked: "blocked",
  already_imported: "already_imported",
};

/**
 * Makes and stores the report of the import's rows not added, and returns its attachment's id, or null when every row
 * was added or the file is no longer kept.
 */
export async function makeImportReport(
  context: ListenerContext,
  dependencies: Pick<ImportJobDependencies, "files" | "spreadsheets">,
  batch: ImportBatchRow,
): Promise<string | null> {
  const { rows, today } = await context.forOrg(async (tx) => ({
    rows: await tx.importRow.findMany({
      where: { batchId: batch.id, outcome: { in: ["not_added", "left_out"] } },
      orderBy: { rowNumber: "asc" },
      select: { rowNumber: true, plan: true, reasons: true },
    }),
    today: calendarDateIn(new Date(), await organizationTimeZone(tx, batch.organizationId)),
  }));
  if (rows.length === 0 || batch.fileAttachmentId === null) return null;
  const sheet = await readImportFile(dependencies, batch);
  const cellsOf = new Map(sheet.rows.map((row) => [row.rowNumber, row.cells]));
  const columns: WriterColumn[] = [
    { header: "Why it wasn't added", kind: "text" },
    { header: "Row", kind: "number" },
    ...sheet.header.map((header) => ({ header, kind: "text" as const })),
  ];
  const writer = dependencies.spreadsheets.writer({ kind: batch.fileKind, sheetName: "Rows not added", columns });
  writer.write(
    rows.map((row): WrittenCell[] => {
      const first = row.reasons[0];
      const reason = first === undefined ? { code: reasonOfPlan[row.plan] ?? "not_reached" } : decodeRowReason(first);
      return [reportSentence(reason, today), row.rowNumber, ...(cellsOf.get(row.rowNumber) ?? [])];
    }),
  );
  const stored = await dependencies.files.storeGeneratedFile(context.actor, {
    recordType: IMPORT_REPORT_RECORD_TYPE,
    recordId: batch.id,
    attachmentId: batch.id,
    fileName: reportFileName(batch.fileName, batch.fileKind),
    contentType: reportContentType(batch.fileKind),
    body: await writer.finish(),
  });
  return stored.id;
}
