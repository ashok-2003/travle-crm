// The file of one lite turn's trace: its key in object storage, its gzip JSON, and reading it back.
import { gunzipSync, gzipSync } from "node:zlib";
import { storedTraceFile, type StoredTraceFile } from "@travel-crm/contracts/ai";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import type { LiteTrace } from "../lite/types.js";

/** How long a trace is kept, row and file. */
export const TRACE_DAYS = 14;

/**
 * A stored trace as it is read back: `version` is held as the first field so a later format can be told apart, and a
 * field the file lacks (one added to the trace after it was written) reads as null or empty.
 */
export type TraceFile = StoredTraceFile;

/** organizations/<org>/ai-traces/<UTC day>/<id>.json.gz: under the organization's prefix, so its purge takes them too. */
export function traceKey(organizationId: string, startedAt: Date, traceId: string): string {
  return `organizations/${organizationId}/ai-traces/${startedAt.toISOString().slice(0, 10)}/${traceId}.json.gz`;
}

/** The whole trace but the organization (the key says it), whatever fields it has: none is listed here. */
export function traceFileOf(trace: LiteTrace): Uint8Array {
  const rest: Partial<LiteTrace> = { ...trace };
  delete rest.organizationId;
  const file = { version: 1, trace: rest };
  return gzipSync(JSON.stringify(file));
}

/** A stored trace, or null when there is no file or it is not one of ours. The start comes back as a Date. */
export async function readTraceFile(storage: ObjectStorage, key: string): Promise<TraceFile | null> {
  const bytes = await storage.get(key);
  if (bytes === null) return null;
  try {
    const parsed = storedTraceFile.safeParse(JSON.parse(gunzipSync(bytes).toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
