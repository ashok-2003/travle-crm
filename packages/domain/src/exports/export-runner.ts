// Making an export's file (B37-B42; spec 8): what every kind's export does, around the kind's own rows. The requester's
// access afresh (B41), the count first (the progress, and the kind's row limit), then a page at a time into one file,
// stored once under the export's id; then, in one transaction, ready for 24 hours, export.made in the audit log and the
// outbox, the search emptied, and the requester told. Only a making export is worked on, so a repeat is harmless.
import { spreadsheetContentTypeOf } from "@travel-crm/contracts/files";
import type {
  ExportFailureReason,
  ExportFormat,
  ExportKind,
  ExportRequestedEvent,
} from "@travel-crm/contracts/exports";
import type { WriterColumn, WrittenCell } from "@travel-crm/integrations/spreadsheets";
import { recordAudit } from "../audit/index.js";
import { DATA_EXPORT_RECORD_TYPE } from "../files/index.js";
import { type MemberAccess, organizationTimeZone, type Permission } from "../identity/index.js";
import {
  type DomainEvent,
  type EventPayload,
  type JsonValue,
  type ListenerContext,
  publishEvent,
} from "../jobs/index.js";
import {
  calendarDateIn,
  type CalendarDate,
  formatIndianNumber,
  systemActor,
  timeOfDayIn,
  type TimeOfDay,
} from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import type { ExportJobDependencies } from "./dependencies.js";
import { type DataExportRow, holdExport, toExportRow } from "./export-row.js";

/** How long a made file is kept for its requester (B42). */
export const EXPORT_KEPT_MS = 24 * 60 * 60 * 1000;

/** One kind's export: its permission, sheet, columns and file name, how to read its stored filter, and its rows. */
export interface ExportSource<Filter> {
  kind: ExportKind;
  /** The permission the requester must still hold when the job starts (B41). */
  requires: Permission;
  sheetName: string;
  columns: readonly WriterColumn[];
  fileName(stamp: { day: CalendarDate; time: TimeOfDay }, format: ExportFormat): string;
  filterOf(stored: unknown): Filter;
  maxRows: number | null;
  count(context: Pick<ListenerContext, "forOrg">, access: MemberAccess, filter: Filter): Promise<number>;
  /** A page of rows after the cursor, in its own transaction(s); next is null after the last page. */
  page(
    context: Pick<ListenerContext, "forOrg">,
    access: MemberAccess,
    filter: Filter,
    after: string | null,
  ): Promise<{ rows: WrittenCell[][]; next: string | null }>;
  /** export.made's view of the filter: ids and fixed values, `searched: true` for a search, never its text. */
  auditFilter(filter: Filter): JsonValue;
  /** The filter kept once the file is made: the search emptied. */
  keptFilter(filter: Filter): EventPayload;
}

const nounOf: Record<ExportKind, [string, string]> = { leads: ["lead", "leads"], staff: ["person", "people"] };

/** The requester's access afresh, as the job's actor (source job, or impersonation when support asked for it). */
async function requesterAccess(
  dependencies: ExportJobDependencies,
  row: DataExportRow,
  requires: Permission,
): Promise<{ access: MemberAccess } | { failure: ExportFailureReason }> {
  const access = await dependencies.identity.resolveAccess(row.requestedBy, row.organizationId, {
    impersonatedBy: row.impersonatedBy,
  });
  if (access === null) return { failure: "no_longer_a_member" };
  if (!access.permissions.has(requires)) return { failure: "lost_permission" };
  const source = row.impersonatedBy === null ? "job" : "impersonation";
  return { access: { ...access, source, impersonatedBy: row.impersonatedBy } };
}

export async function runExport<Filter>(
  event: DomainEvent<ExportRequestedEvent>,
  context: ListenerContext,
  dependencies: ExportJobDependencies,
  source: ExportSource<Filter>,
): Promise<void> {
  const exportId = event.payload.exportId;
  const found = await context.forOrg((tx) => tx.dataExport.findUnique({ where: { id: exportId } }));
  const row = found === null ? null : toExportRow(found);
  if (row?.status !== "making" || row.kind !== source.kind) return;
  const filter = source.filterOf(row.filter);
  const started = performance.now();
  // One line per export, once it has ended: ids, kind, format, row count and how long it took.
  const summarise = (outcome: "ready" | "failed", more: Record<string, string | number>) => {
    dependencies.logger?.info(
      {
        organizationId: row.organizationId,
        exportId,
        kind: row.kind,
        format: row.format,
        outcome,
        ...more,
        durationMs: Math.round(performance.now() - started),
      },
      "export finished",
    );
  };
  const fail = async (failureReason: ExportFailureReason) => {
    await context.forOrg(async (tx) => {
      if ((await holdExport(tx, exportId))?.status !== "making") return;
      await tx.dataExport.update({
        where: { id: exportId },
        data: { status: "failed", failureReason, filter: source.keptFilter(filter) },
      });
    });
    summarise("failed", { failureReason });
  };

  const resolved = await requesterAccess(dependencies, row, source.requires);
  if ("failure" in resolved) return fail(resolved.failure);
  const { access } = resolved;
  const rowsTotal = await source.count(context, access, filter);
  if (source.maxRows !== null && rowsTotal > source.maxRows) return fail("too_many_rows");
  await context.forOrg((tx) => tx.dataExport.update({ where: { id: exportId }, data: { rowsTotal } }));

  const writer = dependencies.spreadsheets.writer({
    kind: row.format,
    sheetName: source.sheetName,
    columns: source.columns,
  });
  let rowsDone = 0;
  for (let after: string | null = null, first = true; first || after !== null; first = false) {
    const page = await source.page(context, access, filter, after);
    writer.write(page.rows);
    rowsDone += page.rows.length;
    await context.forOrg((tx) => tx.dataExport.update({ where: { id: exportId }, data: { rowsDone } }));
    after = page.next;
  }

  const now = new Date();
  const timeZone = await context.forOrg((tx) => organizationTimeZone(tx, row.organizationId));
  const stamp = { day: calendarDateIn(now, timeZone), time: timeOfDayIn(now, timeZone) };
  const stored = await dependencies.files.storeGeneratedFile(access, {
    recordType: DATA_EXPORT_RECORD_TYPE,
    recordId: exportId,
    // The export's own id: a retried job stores its file once.
    attachmentId: exportId,
    fileName: source.fileName(stamp, row.format),
    contentType: spreadsheetContentTypeOf[row.format],
    body: await writer.finish(),
  });

  await context.forOrg(async (tx) => {
    if ((await holdExport(tx, exportId))?.status !== "making") return;
    await tx.dataExport.update({
      where: { id: exportId },
      data: {
        status: "ready",
        fileAttachmentId: stored.id,
        rowsDone,
        readyAt: now,
        expiresAt: new Date(now.getTime() + EXPORT_KEPT_MS),
        filter: source.keptFilter(filter),
      },
    });
    await recordAudit(tx, access, {
      action: "export.made",
      entityType: "data_export",
      entityId: exportId,
      after: { kind: row.kind, format: row.format, rows: rowsDone, filter: source.auditFilter(filter) },
    });
    await publishEvent(tx, { type: "export.made", payload: { exportId, kind: row.kind } });
    const [one, many] = nounOf[row.kind];
    // As the system, with the requester as the one told: notify() leaves its own actor out (D20).
    await notify(tx, systemActor(row.organizationId), {
      recipientUserIds: [row.requestedBy],
      sourceEventId: event.id,
      kind: "export.ready",
      title: `Your ${row.kind} export is ready`,
      body: `${formatIndianNumber(rowsDone)} ${rowsDone === 1 ? one : many}, kept for 24 hours.`,
      link: `/${row.kind}/exports/${exportId}`,
      channels: ["push"],
    });
  });
  summarise("ready", { rows: rowsDone });
}
