// An import whose file the server already holds (the Sheets sync's connect-time import): a Google Sheet's rows as CSV
// bytes, stored as the import's file by the system, the import made ready to read for the person who connected the
// sheet, and import.uploaded published for the worker, as a confirmed upload does. Asked again with the same import
// id (a retried job), it reuses what the first run stored and publishes once.
import { type Database, isUniqueViolation } from "@travel-crm/db";
import { type Files, IMPORT_FILE_RECORD_TYPE } from "../files/index.js";
import { publishEvent } from "../jobs/index.js";
import { systemActor } from "../kernel/index.js";
import { keepUntilFrom } from "./batches.js";

export interface StartImportFromBytesInput {
  /** Chosen by the caller, so a retry names the same import. */
  importId: string;
  organizationId: string;
  /** The person the import is for: its job acts as them (B31). */
  startedBy: string;
  impersonatedBy: string | null;
  fileName: string;
  /** The rows as CSV, the header first. */
  bytes: Uint8Array;
  /** The Google Sheet connection the rows came from; give this or sourceMetaFormId. */
  sourceSheetId?: string;
  /** The Meta lead form the rows came from (its last 30 days of leads). */
  sourceMetaFormId?: string;
}

export async function startImportFromBytes(
  db: Database,
  files: Files,
  input: StartImportFromBytesInput,
  now: Date,
): Promise<{ importId: string }> {
  const { importId, organizationId } = input;
  const recorded = await db.forOrg(organizationId, (tx) =>
    tx.importBatch.findUnique({ where: { id: importId }, select: { id: true } }),
  );
  if (recorded !== null) return { importId };
  const actor = systemActor(organizationId);
  const record = { recordType: IMPORT_FILE_RECORD_TYPE, recordId: importId };
  // A run that stored the file and stopped before recording the import left it under the import's id: used again.
  const [stored] = await files.list(actor, record);
  const file =
    stored ??
    (await files.storeGeneratedFile(actor, {
      ...record,
      fileName: input.fileName,
      contentType: "text/csv",
      body: input.bytes,
    }));
  try {
    await db.forOrg(organizationId, async (tx) => {
      await tx.importBatch.create({
        data: {
          id: importId,
          kind: "leads",
          status: "reading",
          fileName: input.fileName,
          fileKind: "csv",
          fileAttachmentId: file.id,
          startedBy: input.startedBy,
          impersonatedBy: input.impersonatedBy,
          ...(input.sourceSheetId === undefined ? {} : { sourceSheetId: input.sourceSheetId }),
          ...(input.sourceMetaFormId === undefined ? {} : { sourceMetaFormId: input.sourceMetaFormId }),
          keepUntil: keepUntilFrom(now),
        },
      });
      await publishEvent(tx, { type: "import.uploaded", payload: { importId } });
    });
  } catch (error) {
    // Another run recorded it first, and published its event.
    if (!isUniqueViolation(error)) throw error;
  }
  return { importId };
}
