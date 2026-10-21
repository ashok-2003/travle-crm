// An import's file as its kind's limits read it (B1, B2): the check's and the add's one reader, so the preview and the
// add can't read a file differently.
import { importRowLimits, MAX_CELL_LENGTH, MAX_IMPORT_COLUMNS } from "@travel-crm/contracts/imports";
import type { ReadLimits, ReadSheet } from "@travel-crm/integrations/spreadsheets";
import { IMPORT_FILE_RECORD_TYPE } from "../files/index.js";
import { DomainError } from "../kernel/index.js";
import type { ImportBatchRow } from "./batch-row.js";
import type { ImportJobDependencies } from "./dependencies.js";

type FileOfBatch = Pick<ImportBatchRow, "organizationId" | "id" | "kind" | "fileKind" | "fileAttachmentId">;

export function readLimitsOf(batch: Pick<ImportBatchRow, "kind" | "fileKind">): ReadLimits {
  return {
    kind: batch.fileKind,
    maxRows: importRowLimits[batch.kind],
    maxColumns: MAX_IMPORT_COLUMNS,
    maxCellLength: MAX_CELL_LENGTH,
  };
}

/** The file's bytes; NOT_FOUND once the sweep or an erasure withdrew it (the job then ends file_withdrawn). */
export async function importFileBytes(files: ImportJobDependencies["files"], batch: FileOfBatch): Promise<Uint8Array> {
  if (batch.fileAttachmentId === null) {
    throw new DomainError("NOT_FOUND", "ATTACHMENT_NOT_FOUND", "The import's file is no longer kept");
  }
  const file = await files.systemFile(batch.organizationId, {
    recordType: IMPORT_FILE_RECORD_TYPE,
    recordId: batch.id,
    attachmentId: batch.fileAttachmentId,
  });
  return file.body;
}

/** The import's file, read with its kind's limits. */
export async function readImportFile(
  dependencies: Pick<ImportJobDependencies, "files" | "spreadsheets">,
  batch: FileOfBatch,
): Promise<ReadSheet> {
  return dependencies.spreadsheets.read(await importFileBytes(dependencies.files, batch), readLimitsOf(batch));
}
