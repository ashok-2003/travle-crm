// "Connect the sheet" (S10, S14): from the last connect step with the fields complete, the sheet is the confirming
// member's (their access is what every check acts as), one audit entry says so, and the baseline is requested for the
// worker to read the whole tab.
import type { Database } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError } from "../kernel/index.js";
import { matchedFields } from "./columns.js";
import { holdSheet, sheetNotReady } from "./connection-row.js";
import { storedColumns } from "./verify.js";

export async function confirmSheet(db: Database, access: MemberAccess, sheetId: string, now: Date): Promise<void> {
  await db.forOrg(access.organizationId, async (tx) => {
    // Held, so a second press takes its turn and finds the sheet moved on.
    const sheet = await holdSheet(tx, sheetId);
    if (sheet === null || sheet.status === "disconnected")
      throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such sheet");
    if (sheet.status !== "connecting" || sheet.step !== "existing") throw sheetNotReady();
    const columns = await storedColumns(tx, sheet.id);
    if (!matchedFields(columns).complete) throw sheetNotReady();
    // A sheet with no rows skips the choice: nothing is there to add.
    const existingRows = sheet.existingRows ?? "only_new";
    await tx.sheetConnection.update({
      where: { id: sheet.id },
      data: {
        step: "done",
        existingRows,
        connectedBy: access.userId,
        impersonatedBy: access.impersonatedBy,
        touchedAt: now,
      },
    });
    await recordAudit(tx, access, {
      action: "sheet.connected",
      entityType: "sheet_connection",
      entityId: sheet.id,
      after: { existingRows, columnsMatched: columns.filter((column) => column.field !== null).length },
    });
    await publishEvent(tx, { type: "sheet.baseline-requested", payload: { sheetId: sheet.id } });
  });
}
