// A sheet that stops needing rows read (S39, S40, S15, S34, S45): lost access, a missing tab, missing columns, a connector
// who can no longer manage lead sources. Entering one records the change once, by the system, and publishes
// sheet.attention for the one notice to the Owner; coming back to running is recorded and told to nobody.
import type { AttentionState } from "@travel-crm/contracts/sheets";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { publishEvent } from "../jobs/index.js";
import { systemActor } from "../kernel/index.js";
import type { SheetConnectionRow } from "./connection-row.js";

/** What entering each state records (the audit log screen reads these action words from this type). */
const entered: Record<
  AttentionState,
  { action: "sheet.access-lost" | "sheet.tab-missing" | "sheet.columns-missing" | "sheet.needs-manager" }
> = {
  lost_access: { action: "sheet.access-lost" },
  tab_missing: { action: "sheet.tab-missing" },
  columns_missing: { action: "sheet.columns-missing" },
  needs_manager: { action: "sheet.needs-manager" },
};

/**
 * Moves the sheet into the attention state, records it by the system actor, and publishes sheet.attention (the notice)
 * and sheet.schedule-changed (it keeps being checked, so sharing again fixes it). False, and nothing recorded, when it
 * is in that state already: the same state twice notifies once (S45).
 */
export async function enterAttention(
  tx: OrgTx,
  input: { sheet: Pick<SheetConnectionRow, "id" | "organizationId" | "status">; state: AttentionState; now: Date },
): Promise<boolean> {
  const { sheet, state, now } = input;
  if (sheet.status === state) return false;
  await tx.sheetConnection.update({
    where: { id: sheet.id },
    data: { status: state, attentionSince: now, checkStartedAt: null },
  });
  await recordAudit(tx, systemActor(sheet.organizationId), {
    action: entered[state].action,
    entityType: "sheet_connection",
    entityId: sheet.id,
    after: { status: state },
  });
  await publishEvent(tx, { type: "sheet.attention", payload: { sheetId: sheet.id, state } });
  await publishEvent(tx, { type: "sheet.schedule-changed", payload: { sheetId: sheet.id } });
  return true;
}
