// An import's end (B28, B31, B34; spec 8): every row left gets an outcome, the report of rows not added is made, and,
// in one transaction, the status, import.finished in the audit log and the outbox, the importer's notice and whatever
// the kind adds (the owners' notices). Only an adding import ends, so a second call changes nothing.
import type { ImportFailureReason, RowOutcome } from "@travel-crm/contracts/imports";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { ListenerContext } from "../jobs/index.js";
import { publishEvent } from "../jobs/index.js";
import { formatIndianNumber, systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import type { ImportBatchRow } from "./batch-row.js";
import { holdImport, moveImport } from "./batches.js";
import type { ImportJobDependencies } from "./dependencies.js";
import { makeImportReport } from "./report.js";
import { encodeRowReason } from "./row-reasons.js";

export interface ImportEnd {
  status: "done" | "stopped" | "failed";
  failureReason?: ImportFailureReason;
  /** The add's event: the notice's source, so a repeat tells nobody twice. */
  sourceEventId: string;
  notifyImporter: boolean;
  report: boolean;
}

/** The rows the add never got to, and those the importer left out, each with the reason its check gave it. */
async function giveRemainingRowsOutcomes(tx: OrgTx, batch: ImportBatchRow): Promise<void> {
  const remaining = { batchId: batch.id, outcome: null };
  await tx.importRow.updateMany({ where: { ...remaining, plan: "not_added" }, data: { outcome: "not_added" } });
  const leftOut = [
    ...(batch.addBlocked ? [] : ["blocked"]),
    ...(batch.addAlreadyImported ? [] : ["already_imported"]),
    ...(batch.addInCrm ? [] : ["in_crm"]),
  ];
  await tx.importRow.updateMany({ where: { ...remaining, plan: { in: leftOut } }, data: { outcome: "left_out" } });
  await tx.importRow.updateMany({
    where: remaining,
    data: { outcome: "not_added", reasons: [encodeRowReason({ code: "not_reached" })], passwordHash: null },
  });
}

async function outcomeCounts(tx: OrgTx, importId: string): Promise<Record<RowOutcome, number>> {
  const groups = await tx.importRow.groupBy({ by: ["outcome"], where: { batchId: importId }, _count: { _all: true } });
  const counts: Record<RowOutcome, number> = { added: 0, merged: 0, left_out: 0, not_added: 0 };
  for (const group of groups) if (group.outcome !== null) counts[group.outcome as RowOutcome] = group._count._all;
  return counts;
}

const counted = (count: number, one: string, many: string) =>
  `${formatIndianNumber(count)} ${count === 1 ? one : many}`;

const failureWords: Record<ImportFailureReason, string> = {
  no_longer_a_member: "You are no longer on this organization's staff",
  lost_permission: "You can no longer import leads",
  organization_cannot_change: "The organization can't make changes now",
  file_withdrawn: "Its file was deleted",
  row_changed: "A row changed since the check",
  over_seat_limit: "The plan has too few seats free",
};

/** The importer's notice: "Your import is done" and "1,094 new leads, 63 repeat enquiries. 129 rows weren't added." */
function noticeOf(end: ImportEnd, counts: Record<RowOutcome, number>): { title: string; body: string } {
  if (end.status === "failed") {
    const reason = end.failureReason === undefined ? "It couldn't go on" : failureWords[end.failureReason];
    return { title: "Your import stopped", body: `${reason}. The rows added before it stay.` };
  }
  const added = [counted(counts.added, "new lead", "new leads")];
  if (counts.merged > 0) added.push(counted(counts.merged, "repeat enquiry", "repeat enquiries"));
  const notAdded = counts.not_added + counts.left_out;
  const rest = notAdded === 0 ? "" : ` ${counted(notAdded, "row wasn't added", "rows weren't added")}.`;
  return {
    title: end.status === "done" ? "Your import is done" : "Your import was stopped",
    body: `${added.join(", ")}.${rest}`,
  };
}

export async function finishImport(
  context: ListenerContext,
  dependencies: Pick<ImportJobDependencies, "files" | "spreadsheets">,
  importId: string,
  end: ImportEnd,
  alsoInTransaction?: (tx: OrgTx, batch: ImportBatchRow) => Promise<void>,
): Promise<void> {
  const batch = await context.forOrg(async (tx) => {
    const held = await holdImport(tx, importId);
    if (held?.status !== "adding") return null;
    await giveRemainingRowsOutcomes(tx, held);
    return held;
  });
  if (batch === null) return;
  const reportAttachmentId = end.report ? await makeImportReport(context, dependencies, batch) : null;
  await context.forOrg(async (tx) => {
    const now = new Date();
    if ((await holdImport(tx, importId))?.status !== "adding") return;
    await moveImport(tx, importId, ["adding"], end.status, now, {
      failureReason: end.failureReason ?? null,
      reportAttachmentId,
      finishedAt: now,
    });
    const outcomes = await outcomeCounts(tx, importId);
    const actor = systemActor(batch.organizationId);
    await recordAudit(tx, actor, {
      action: "import.finished",
      entityType: "import_batch",
      entityId: importId,
      after: { kind: batch.kind, status: end.status, failureReason: end.failureReason ?? null, outcomes },
    });
    await publishEvent(tx, { type: "import.finished", payload: { importId, kind: batch.kind } });
    if (end.notifyImporter) {
      // As the system, with the importer as the one told: notify() leaves its own actor out (D20).
      await notify(tx, actor, {
        recipientUserIds: [batch.startedBy],
        sourceEventId: end.sourceEventId,
        kind: "import.finished",
        ...noticeOf(end, outcomes),
        link: batch.kind === "leads" ? `/leads/import/${importId}` : `/staff/import/${importId}`,
        channels: ["push"],
      });
    }
    await alsoInTransaction?.(tx, batch);
  });
}
