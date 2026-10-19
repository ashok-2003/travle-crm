// The other direction of S26: Add on an import is refused while a sheet's check is saving rows, with the import's own
// sentence (B29). A check keeps its heartbeat fresh in every batch, so "saving" is a heartbeat from the last half minute.
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import { checkHeartbeatSeconds } from "./limits.js";

/** The AddGuard of imports' Add (N9): refuses with IMPORT_ALREADY_RUNNING while a check of the agency is saving. */
export async function assertNoSheetCheckSaving(tx: OrgTx, now: Date): Promise<void> {
  const saving = await tx.sheetConnection.findFirst({
    where: { checkStartedAt: { gt: new Date(now.getTime() - checkHeartbeatSeconds * 1000) } },
    select: { id: true },
  });
  if (saving !== null) {
    throw new DomainError("CONFLICT", "IMPORT_ALREADY_RUNNING", "Another import of this organization is adding");
  }
}
