// The rows a sheet couldn't add (S27, S31): its page lists the unresolved ones by row number, fifty at a time, from the
// partial index; Hide marks one resolved by hand. The sweep drops resolved ones after seven days.
import {
  type HideProblemInput,
  type SheetProblemReason,
  type SheetProblemsInput,
  type SheetProblemsPage,
  sheetProblemsInput,
} from "@travel-crm/contracts/sheets";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { findSheet } from "./connection-row.js";

export async function sheetProblems(tx: OrgTx, input: SheetProblemsInput): Promise<SheetProblemsPage> {
  const { sheetId, after, limit } = sheetProblemsInput.parse(input);
  await findSheet(tx, sheetId);
  const cursor =
    after === undefined
      ? null
      : await tx.sheetRow.findFirst({ where: { id: after, connectionId: sheetId }, select: { rowNumber: true } });
  const rows = await tx.sheetRow.findMany({
    where: {
      connectionId: sheetId,
      status: "not_added",
      resolvedAt: null,
      ...(cursor === null || after === undefined
        ? {}
        : { OR: [{ rowNumber: { gt: cursor.rowNumber } }, { rowNumber: cursor.rowNumber, id: { gt: after } }] }),
    },
    orderBy: [{ rowNumber: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map((row) => ({
      id: row.id,
      rowNumber: row.rowNumber,
      name: row.exampleName,
      value: row.exampleValue,
      reason: (row.reasons[0] ?? "could_not_add") as SheetProblemReason,
      firstSeenAt: row.firstSeenAt.toISOString(),
    })),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Hide (S31): the line is resolved by hand; the row stays unadded until it is fixed in the sheet. */
export async function hideProblem(tx: OrgTx, access: MemberAccess, input: HideProblemInput, now: Date): Promise<void> {
  const sheet = await findSheet(tx, input.sheetId);
  const row = await tx.sheetRow.findFirst({
    where: { id: input.rowId, connectionId: sheet.id, status: "not_added", resolvedAt: null },
    select: { id: true, rowNumber: true },
  });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such problem");
  await tx.sheetRow.update({ where: { id: row.id }, data: { resolvedAt: now } });
  await recordAudit(tx, access, {
    action: "sheet.problem-hidden",
    entityType: "sheet_connection",
    entityId: sheet.id,
    after: { rowNumber: row.rowNumber },
  });
}
