// What the export job stores, and how it keeps count of it, so the expiry finds every object to delete: each part is
// counted before it is stored, each file copy recorded once it is made, both under the export row's lock. Once the
// export has expired or been withdrawn (an erasure), the job stores nothing more, and deletes a copy it just made.
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { ownMessage } from "@travel-crm/integrations/jobs";
import { storedFileKeys } from "../files/index.js";
import { isUuid } from "../kernel/index.js";
import { exportFileKey, exportPartKey, type ExportRow } from "./organization-export.js";
import type { PlatformServices } from "./services.js";

export interface ExportSizes {
  /** Rows read in one transaction. */
  batchRows: number;
  /** A part is stored once it holds this many bytes; the last one may be smaller. */
  partBytes: number;
}

/** Files copied at a time. */
const COPIES_AT_ONCE = 8;

/**
 * The export stopped mid-way and its job ends quietly: it expired or was withdrawn, or a twin attempt (pg-boss's
 * retry of an attempt it thought lost) finished it first.
 */
export class ExportStopped extends Error {
  constructor() {
    super("The export stopped: expired, withdrawn or finished by another attempt");
    this.name = "ExportStopped";
  }
}

type Recorded = "recorded" | "withdrawn" | "finished";

/** Records what an attempt stores under the export row's lock, while the export is still being written. */
async function recordStored(
  services: PlatformServices,
  exportId: string,
  record: (tx: PlatformTx) => Promise<unknown>,
): Promise<Recorded> {
  return services.platformDb.transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ state: string }[]>`
      SELECT state FROM platform_export WHERE id = ${exportId}::uuid FOR UPDATE`;
    if (row?.state === "requested" || row?.state === "failed") {
      await record(tx);
      return "recorded";
    }
    return row?.state === "done" ? "finished" : "withdrawn";
  });
}

/** Collects JSON lines and stores them a part at a time, numbered from 1, each counted before it is stored. */
export class PartWriter {
  private lines: string[] = [];
  private bytes = 0;
  parts = 0;

  constructor(
    private readonly services: PlatformServices,
    private readonly row: ExportRow,
    private readonly sizes: ExportSizes,
  ) {}

  async add(line: object): Promise<void> {
    const text = `${JSON.stringify(line)}\n`;
    this.lines.push(text);
    this.bytes += Buffer.byteLength(text);
    if (this.bytes >= this.sizes.partBytes) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.lines.length === 0) return;
    const part = this.parts + 1;
    const recorded = await recordStored(
      this.services,
      this.row.id,
      (tx) => tx.$executeRaw`
        UPDATE platform_export SET parts_written = GREATEST(parts_written, ${part}) WHERE id = ${this.row.id}::uuid`,
    );
    if (recorded !== "recorded") throw new ExportStopped();
    await this.services.storage.put({
      key: exportPartKey(this.row, part),
      contentType: "application/x-ndjson",
      body: new TextEncoder().encode(this.lines.join("")),
    });
    this.parts = part;
    this.lines = [];
    this.bytes = 0;
  }
}

/** A stored file's id, from its key: the files module keeps each under its attachment's id. */
function attachmentIdOf(key: string): string {
  const id = key.slice(key.lastIndexOf("/") + 1);
  // Our own fixed words, so the failed-jobs list keeps them.
  if (!isUuid(id)) throw ownMessage(new TypeError("A stored file's key doesn't end in its id"));
  return id;
}

/**
 * Copies every file the organization keeps, removed ones included, beside the export, inside storage. A file whose
 * upload never finished has nothing stored, and nothing to copy.
 */
export async function copyFiles(services: PlatformServices, row: ExportRow): Promise<void> {
  const organizationId = row.targetOrganizationId;
  const keys = await services.platformDb.transaction((tx) =>
    asOrganization(tx, organizationId, (orgTx) => storedFileKeys(orgTx, organizationId)),
  );
  for (let start = 0; start < keys.length; start += COPIES_AT_ONCE) {
    const copied = await Promise.all(
      keys.slice(start, start + COPIES_AT_ONCE).map(async (key) => {
        const attachmentId = attachmentIdOf(key);
        return (await services.storage.copy(key, exportFileKey(row, attachmentId))) ? attachmentId : null;
      }),
    );
    const ids = copied.filter((id) => id !== null);
    if (ids.length === 0) continue;
    const recorded = await recordStored(services, row.id, (tx) =>
      tx.platformExportFile.createMany({
        data: ids.map((attachmentId) => ({ exportId: row.id, attachmentId })),
        skipDuplicates: true,
      }),
    );
    if (recorded === "withdrawn") {
      await Promise.all(ids.map((attachmentId) => services.storage.delete(exportFileKey(row, attachmentId))));
    }
    if (recorded !== "recorded") throw new ExportStopped();
  }
}
