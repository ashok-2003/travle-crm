// When Google does not hand the rows over (S37, S39, S40). A 429 or a busy Google ends the check with no fault and a hold
// on the account; the third scheduled check in a row to lose access, or any from Sync now and Check again, is lost access;
// a tab whose gid is gone is a missing tab. The check always lets go of its claim, and "Last checked" keeps the last
// good time.
import type { GoogleSheetsError } from "@travel-crm/integrations/google-sheets";
import { accountIndexOf } from "./account-index.js";
import { enterAttention } from "./attention.js";
import type { CheckDependencies, CheckOutcome } from "./check-outcome.js";
import { holdSheet, type SheetConnectionRow } from "./connection-row.js";
import { lostAccessAfterFailures } from "./limits.js";
import type { CheckMode } from "./read-plan.js";

const seconds = (from: Date, to: Date) => Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 1000));

export async function handleReadFailure(
  dependencies: CheckDependencies,
  sheet: Pick<SheetConnectionRow, "id" | "organizationId" | "serviceAccountIndex" | "serviceAccountEmail">,
  error: GoogleSheetsError,
  mode: CheckMode,
  now: Date,
): Promise<CheckOutcome> {
  const { db, holds, checkIntervalSeconds } = dependencies;
  const interval = { nextCheckInSeconds: checkIntervalSeconds, keepSchedule: true };

  if (error.reason === "rate_limited") {
    const until = holds.backOff(accountIndexOf(dependencies.google, sheet), now, error.retryAfterSeconds);
    await db.forOrg(sheet.organizationId, (tx) =>
      tx.sheetConnection.update({ where: { id: sheet.id }, data: { checkStartedAt: null, holdUntil: until } }),
    );
    return { result: "failed", nextCheckInSeconds: seconds(now, until), keepSchedule: true };
  }

  const lost = error.reason === "not_shared" || error.reason === "not_found" || error.reason === "not_a_sheet";
  await db.forOrg(sheet.organizationId, async (tx) => {
    const held = await holdSheet(tx, sheet.id);
    if (held === null || held.status === "disconnected") return;
    if (error.reason === "tab_missing") {
      await tx.sheetConnection.update({ where: { id: sheet.id }, data: { checkStartedAt: null } });
      await enterAttention(tx, { sheet: held, state: "tab_missing", now });
      return;
    }
    if (!lost) {
      // A timeout, a 5xx or a network error: nothing is shown to the agency, and the next check tries again.
      await tx.sheetConnection.update({ where: { id: sheet.id }, data: { checkStartedAt: null } });
      return;
    }
    const failures = held.consecutiveFailures + 1;
    await tx.sheetConnection.update({
      where: { id: sheet.id },
      data: { consecutiveFailures: failures, checkStartedAt: null },
    });
    // The first failures of a scheduled check only count, so a blip does not alarm; a person's button does not wait.
    if (mode !== "scheduled" || failures >= lostAccessAfterFailures) {
      await enterAttention(tx, { sheet: held, state: "lost_access", now });
    }
  });
  return { result: "failed", ...interval };
}
