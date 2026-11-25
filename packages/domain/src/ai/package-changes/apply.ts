// Apply (the AI change assistant): the ticked changes of the member's own proposed run, in one transaction under the trip's
// lock. Everything is checked again first: the run is unused, every id is the run's, no change is one the member's role
// may not make, the trip is exactly as it was shown (its stamp), and a departure to cancel took no booking since. Then the
// trip's own operations run, the schedule's departures follow a changed schedule, and the run keeps what changed and what
// it replaced for Undo all, with one audit entry.
import type { ApplyPackageChangesInput, PackageChange } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import { generatePackageDepartures, reconcilePackageDepartures, seatsSoldAndHeld } from "../../departures/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError, type CalendarDate } from "../../kernel/index.js";
import { findPackageForChange, seasonsOf } from "../../quotes/index.js";
import { refuse } from "../refusals.js";
import { applyDepartures, applySeasons, applySelling, applyTripFields } from "./apply-steps.js";
import { departureStates, departuresTouched } from "./departure-states.js";
import { changeRights, rightNeeded, type ChangeRights } from "./ground.js";
import { assertUnchanged, jsonOf, notFound, proposalOf, stampNow, tripChangedSince } from "./runs.js";

export interface ApplyContext {
  today: CalendarDate;
  now: Date;
  /** Whether the plan has departures (with departures:create, a changed schedule makes its departures). */
  departuresOnPlan: boolean;
  /** Who hears of a departure a schedule change left alone, when its leads have no owner. */
  managerUserIds: readonly string[];
}

/** Refuses a change flagged not allowed when proposed, or one the member's role no longer allows. */
function assertAllowed(
  changes: readonly { kind: Parameters<typeof rightNeeded>[0]; flags: string[] }[],
  rights: ChangeRights,
) {
  const refused = changes.some((change) => {
    const right = rightNeeded(change.kind);
    return change.flags.includes("not_allowed") || (right !== null && !rights[right]);
  });
  if (refused) throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Your role doesn't allow one of these changes");
}

/** A departure to cancel that had no bookings when shown must still have none: one taken since changes the trip. */
async function assertNoSalesSince(tx: OrgTx, chosen: readonly PackageChange[], now: Date): Promise<void> {
  const ids = chosen.flatMap((change) =>
    change.kind === "departure_cancel" && !change.flags.includes("has_bookings") ? [change.departureId] : [],
  );
  if (ids.length === 0) return;
  const sales = await seatsSoldAndHeld(tx, ids, now);
  if ([...sales.values()].some((one) => one.sold + one.held > 0)) throw tripChangedSince();
}

export async function applyPackageChanges(
  tx: OrgTx,
  access: MemberAccess,
  input: ApplyPackageChangesInput,
  context: ApplyContext,
): Promise<{ applied: number }> {
  const found = await tx.packageChangeRun.findFirst({
    where: { id: input.runId, requestedBy: access.userId },
    select: { templateId: true },
  });
  if (found === null) throw notFound();
  const trip = await findPackageForChange(tx, found.templateId);
  // Read again under the trip's lock: a second Apply of the same run waits for the first, then finds it used.
  const run = await tx.packageChangeRun.findUniqueOrThrow({
    where: { id: input.runId },
    select: { status: true, proposal: true, tripStamp: true },
  });
  if (run.status !== "proposed") {
    throw refuse("PACKAGE_CHANGES_USED", "These changes were applied or undone already: show the changes again");
  }
  const proposal = proposalOf(run);
  const ids = new Set(input.changeIds);
  const chosen = proposal.changes.filter((change) => ids.has(change.id));
  if (chosen.length !== ids.size) throw notFound();
  const rights = changeRights(access, context.departuresOnPlan);
  assertAllowed(chosen, rights);
  await assertUnchanged(tx, trip.id, proposal.from, run.tripStamp, context.now);
  await assertNoSalesSince(tx, chosen, context.now);

  const seasons = await seasonsOf(tx, trip.id);
  const departuresBefore = await departureStates(tx, trip.id);
  await applySeasons(tx, access, trip.id, chosen, seasons);
  const fields = await applyTripFields(tx, access, trip, chosen);
  // Making departures is departures work: skipped, as a person's save skips it, without the permission or the plan.
  if (fields.scheduleChanged && rights.addDepartures) {
    await reconcilePackageDepartures(tx, access, trip.id, context.today, context.managerUserIds);
    await generatePackageDepartures(tx, access, trip.id, context.today);
  }
  const unchanged = await applyDepartures(tx, access, trip.id, chosen, context);
  const selling = await applySelling(tx, access, trip, chosen, context.today);
  const touched = departuresTouched(departuresBefore, await departureStates(tx, trip.id));

  // Only what changed counts: days to add that someone added meanwhile (past the days the stamp reads) don't.
  const applied = chosen.flatMap((change) => (unchanged.has(change.id) ? [] : [change.id]));
  await tx.packageChangeRun.update({
    where: { id: input.runId },
    data: {
      status: "applied",
      appliedChangeIds: applied,
      before: jsonOf({ seasons, fields: fields.before, selling, ...touched }),
      stampAfter: await stampNow(tx, trip.id, proposal.from, context.now),
      appliedAt: context.now,
    },
  });
  await recordAudit(tx, access, {
    action: "package.ai-changes-applied",
    entityType: "quote_template",
    entityId: trip.id,
    after: { runId: input.runId, applied: applied.length },
  });
  return { applied: applied.length };
}
