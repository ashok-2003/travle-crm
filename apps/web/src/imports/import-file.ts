// What an import's file must be before it is sent (spec B2): .xlsx or .csv, told by its extension and never by the
// type the browser reports (Windows calls a CSV application/vnd.ms-excel), not empty, at most 10 MB, and a name storage
// keeps. An old .xls or a Numbers file is told how to save itself instead.
import {
  attachmentFileName,
  MAX_IMPORT_BYTES,
  spreadsheetContentTypeOf,
  type SpreadsheetContentType,
} from "@travel-crm/contracts/files";

/** Message keys in "imports.problems". */
export type ImportFileProblem = "type" | "old" | "size" | "empty" | "name";

/** Each extension's type, by name (W8). */
const byExtension: Readonly<Record<string, SpreadsheetContentType>> = spreadsheetContentTypeOf;

/** Files Excel or Numbers save that an import can't read, but can once saved again. */
const savedOtherwise = new Set(["xls", "numbers"]);

/** What the file picker offers: the two kinds by extension (types differ between systems). */
export const ACCEPTED_IMPORT_FILES = ".xlsx,.csv";

export function checkImportFile(file: {
  name: string;
  type: string;
  size: number;
}): { ok: true; contentType: SpreadsheetContentType } | { ok: false; problem: ImportFileProblem } {
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? "";
  if (savedOtherwise.has(extension)) return { ok: false, problem: "old" };
  const contentType = byExtension[extension];
  if (contentType === undefined) return { ok: false, problem: "type" };
  if (file.size === 0) return { ok: false, problem: "empty" };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, problem: "size" };
  if (!attachmentFileName.safeParse(file.name).success) return { ok: false, problem: "name" };
  return { ok: true, contentType };
}
