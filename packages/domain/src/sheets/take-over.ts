// Take over (S34): when the member who connected a sheet can no longer manage lead sources, any manager may take it over.
// They become the connector (one audit entry), the sheet runs again, and the rows that waited are added at the next check.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { holdSheet, sheetNotReady } from "./connection-row.js";
import { leaveAttention } from "./attention.js";

export async function takeOverSheet(tx: OrgTx, access: MemberAccess, sheetId: string): Promise<void> {
  const sheet = await holdSheet(tx, sheetId);
  if (sheet === null || sheet.status === "disconnected")
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such sheet");
  if (sheet.status !== "needs_manager") throw sheetNotReady();
  await tx.sheetConnection.update({
    where: { id: sheet.id },
    data: { connectedBy: access.userId, impersonatedBy: access.impersonatedBy },
  });
  await leaveAttention(tx, sheet);
  await recordAudit(tx, access, {
    action: "sheet.taken-over",
    entityType: "sheet_connection",
    entityId: sheet.id,
    after: { status: "running" },
  });
}
