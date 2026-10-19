// The payloads of an import's step events (spec 7, ADR 0009): ids and the kind, never a file's name or a cell.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { importKind } from "./import-batch.js";

/** import.uploaded: the file is in storage, for the worker to read. */
export const importUploadedEvent = z.strictObject({ importId: recordId });
export type ImportUploadedEvent = z.infer<typeof importUploadedEvent>;

/**
 * import.read (the file is read and the import waits at matching), import.columns-matched, import.add-requested and
 * import.finished: each kind's listener acts on its own kind.
 */
export const importStepEvent = z.strictObject({ importId: recordId, kind: importKind });
export type ImportStepEvent = z.infer<typeof importStepEvent>;
