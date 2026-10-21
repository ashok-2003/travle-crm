// The other direction of S26: Add on an import is refused while a sheet's check is saving rows, with the import's own
// sentence (B29). A check keeps its heartbeat fresh in every batch, so "saving" is a heartbeat from the last half minute.
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import { checkHeartbeatSeconds } from "./limits.js";

/**
 * Both sides of S26 (an import's Add and a sheet's check each refuse while the other works) take this lock first, in
 * their own transaction, before reading the other's flag: so two that start together take turns, and the second sees the
 * first's flag instead of both reading "nobody" and both going on (SD11). Held to the transaction's end.
 */
export async function lockAddAgainstChecks(tx: OrgTx, organizationId?: string): Promise<void> {
  // The guard side knows no organization id, only that the transaction sees one organization's rows: an organization
  // with no sheet has no check to wait for.
  const organization =
    organizationId ?? (await tx.sheetConnection.findFirst({ select: { organizationId: true } }))?.organizationId;
  if (organization === undefined) return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sheet-add:${organization}`}, 0))`;
}

/** The AddGuard of imports' Add (N9): refuses with IMPORT_ALREADY_RUNNING while a check of the agency is saving. */
export async function assertNoSheetCheckSaving(tx: OrgTx, now: Date): Promise<void> {
  await lockAddAgainstChecks(tx);
  const saving = await tx.sheetConnection.findFirst({
    where: { checkStartedAt: { gt: new Date(now.getTime() - checkHeartbeatSeconds * 1000) } },
    select: { id: true },
  });
  if (saving !== null) {
    throw new DomainError("CONFLICT", "IMPORT_ALREADY_RUNNING", "Another import of this organization is adding");
  }
}
