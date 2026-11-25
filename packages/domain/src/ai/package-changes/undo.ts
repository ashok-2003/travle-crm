// Undo all (the AI change assistant): the trip's latest applied run put back in one transaction under the trip's lock,
// only while the trip is exactly as the apply left it. Any member who may edit the trip undoes it, with the departures
// and AI-switch rights the run's changes needed; one audit entry besides each operation's own. What it couldn't put back
// is said: the departures kept as they are, and an AI switch that can't be turned back on.
import type { UndoPackageChangesInput, UndoPackageChangesResult } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";
import { findPackageForChange, mergePackagePart, setPackageSellable, updatePackage } from "../../quotes/index.js";
import { refuse } from "../refusals.js";
import type { ApplyContext } from "./apply.js";
import { changeRights } from "./ground.js";
import { assertUnchanged, beforeOf, latestAppliedRun, notFound, proposalOf } from "./runs.js";
import { restoreDepartures, restoreSeasons } from "./undo-steps.js";

export async function undoPackageChanges(
  tx: OrgTx,
  access: MemberAccess,
  input: UndoPackageChangesInput,
  context: ApplyContext,
): Promise<UndoPackageChangesResult> {
  const found = await tx.packageChangeRun.findFirst({ where: { id: input.runId }, select: { templateId: true } });
  if (found === null) throw notFound();
  const trip = await findPackageForChange(tx, found.templateId);
  const run = await latestAppliedRun(tx, trip.id);
  if (run?.id !== input.runId || run.status !== "applied") {
    throw refuse("PACKAGE_CHANGES_NOT_UNDOABLE", "Only the latest changes applied to this trip can be undone");
  }
  const before = beforeOf(run);
  const rights = changeRights(access, context.departuresOnPlan);
  const touchedDepartures = before.departures.length > 0 || before.createdDepartureIds.length > 0;
  if ((touchedDepartures && !rights.editDepartures) || (before.selling !== null && !rights.selling)) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Your role doesn't allow undoing these changes");
  }
  await assertUnchanged(tx, trip.id, proposalOf(run).from, run.stampAfter, context.now);

  if (Object.keys(before.fields).length > 0) {
    await updatePackage(tx, access, mergePackagePart(trip, { packageId: trip.id, ...before.fields }));
  }
  await restoreSeasons(tx, access, trip.id, before.seasons);
  const kept = await restoreDepartures(tx, access, trip.id, before, context);
  let sellingNotRestored = false;
  if (before.selling !== null && before.selling !== trip.aiSellable) {
    try {
      await setPackageSellable(tx, access, { packageId: trip.id, sellable: before.selling }, context.today);
    } catch (error) {
      // The switch was on with something missing: it stays off until that is filled (turning on refuses before it writes).
      if (!(error instanceof DomainError && error.reason === "PACKAGE_NOT_READY_TO_SELL")) throw error;
      sellingNotRestored = true;
    }
  }

  const undone = run.appliedChangeIds.length;
  await tx.packageChangeRun.update({ where: { id: run.id }, data: { status: "undone", undoneAt: context.now } });
  await recordAudit(tx, access, {
    action: "package.ai-changes-undone",
    entityType: "quote_template",
    entityId: trip.id,
    after: { runId: run.id, undone, kept: kept.length, sellingNotRestored },
  });
  return { undone, kept, sellingNotRestored };
}
