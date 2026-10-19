// The first step of a check (spec 7, S26, S34, S44): whether it should go on at all, and as whom. It does nothing when the
// sheet isn't one to check, an earlier check started under five minutes ago, Google or the account asked to wait, or an
// import is adding; it resolves the connector's access afresh (outside any transaction: identity runs its own) and, when
// the connector has gone, makes the sheet need a manager; and it sets the check's claim in a transaction that holds the sheet.
import type { MemberAccess } from "../../identity/index.js";
import { isAnyImportAdding } from "../../imports/index.js";
import {
  type CheckDependencies,
  type CheckMode,
  type CheckOutcome,
  claimSeconds,
  connectorAccess,
  enterAttention,
  holdSheet,
  leaveAttention,
  sheetOf,
  type SheetConnectionRow,
} from "../../sheets/index.js";

export type Claim =
  { kind: "skip"; outcome: CheckOutcome } | { kind: "go"; sheet: SheetConnectionRow; access: MemberAccess };

/** The statuses whose sheets are checked: running ones, and those that stopped reading rows but are looked at to recover. */
const checkable: ReadonlySet<string> = new Set([
  "running",
  "lost_access",
  "tab_missing",
  "columns_missing",
  "needs_manager",
]);
/** An import that is adding holds checks off for a minute (S26). */
const IMPORT_WAIT_SECONDS = 60;

const secondsUntil = (now: Date, until: Date) => Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
const startedRecently = (sheet: Pick<SheetConnectionRow, "checkStartedAt">, now: Date) =>
  sheet.checkStartedAt !== null && now.getTime() - sheet.checkStartedAt.getTime() < claimSeconds * 1000;

export async function claimCheck(
  dependencies: CheckDependencies,
  input: { organizationId: string; sheetId: string; mode: CheckMode },
  now: Date,
): Promise<Claim> {
  const { db, holds, checkIntervalSeconds } = dependencies;
  const { organizationId, sheetId, mode } = input;
  const skip = (nextCheckInSeconds: number, keepSchedule = true): Claim => ({
    kind: "skip",
    outcome: { result: "skipped", nextCheckInSeconds, keepSchedule },
  });

  const sheet = await db.forOrg(organizationId, (tx) => sheetOf(tx, sheetId));
  // Not a sheet to check, or one that never got its baseline: nothing to schedule.
  if (sheet === null || !checkable.has(sheet.status) || sheet.connectedAt === null)
    return skip(checkIntervalSeconds, false);

  const waits = [sheet.holdUntil, holds.heldUntil(sheet.serviceAccountIndex, now)].flatMap((until) =>
    until !== null && until > now ? [until] : [],
  );
  if (waits.length > 0) return skip(secondsUntil(now, new Date(Math.max(...waits.map((until) => until.getTime())))));
  if (mode === "scheduled" && startedRecently(sheet, now)) return skip(checkIntervalSeconds);
  if (await db.forOrg(organizationId, (tx) => isAnyImportAdding(tx))) return skip(IMPORT_WAIT_SECONDS);

  const resolved = await connectorAccess(dependencies, sheet);
  if ("failure" in resolved) {
    // The agency can't change today (read-only): nothing is read and the cursor stays (S44). Anyone else has gone (S34).
    if (resolved.failure !== "organization_cannot_change") {
      await db.forOrg(organizationId, async (tx) => {
        const held = await holdSheet(tx, sheetId);
        if (held !== null && checkable.has(held.status)) {
          await enterAttention(tx, { sheet: held, state: "needs_manager", now });
        }
      });
    }
    return skip(checkIntervalSeconds);
  }

  const claimed = await db.forOrg(organizationId, async (tx) => {
    const held = await holdSheet(tx, sheetId);
    if (held === null || !checkable.has(held.status)) return null;
    if (mode === "scheduled" && startedRecently(held, now)) return null;
    await tx.sheetConnection.update({ where: { id: sheetId }, data: { checkStartedAt: now } });
    // The connector can act again: the sheet needs no manager (S34).
    if (held.status === "needs_manager") await leaveAttention(tx, held);
    return held;
  });
  return claimed === null ? skip(checkIntervalSeconds) : { kind: "go", sheet: claimed, access: resolved.access };
}
