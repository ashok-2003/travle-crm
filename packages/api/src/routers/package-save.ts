// Saving a package and, when its schedule changed, making the departures that now fit: shared by a full save and a part.
import type { UpdatePackageInput } from "@travel-crm/contracts/quotes";
import { generatePackageDepartures, reconcilePackageDepartures } from "@travel-crm/domain/departures";
import { findPackage, updatePackage, type PackageRow } from "@travel-crm/domain/quotes";
import type { Database } from "@travel-crm/db";
import type { Identity, MemberAccess } from "@travel-crm/domain/identity";
import type { Entitlements } from "@travel-crm/domain/subscriptions";
import { agencyToday, mayMakeDepartures } from "../package-departures-gate.js";

interface SaveContext {
  db: Database;
  identity: Pick<Identity, "organizationProfile" | "membersHolding">;
  member: MemberAccess;
  entitlements?: Entitlements | null;
}

const same = (left: readonly number[], right: readonly number[]) =>
  [...left].sort().join() === [...right].sort().join();

/** Whether a save moves what departures are made from: the kind, days, months, nights or seats. */
const scheduleChanged = (before: PackageRow, input: UpdatePackageInput) =>
  before.kind !== input.kind ||
  !same(before.weeklyDays, input.weeklyDays) ||
  !same(before.departureMonths, input.departureMonths) ||
  before.nights !== input.nights ||
  before.seatsPerDeparture !== input.seatsPerDeparture;

/** `inputFor` turns the stored package into the full save: the request as it came, or a part put over the stored fields. */
export async function savePackageWithSchedule(
  ctx: SaveContext,
  packageId: string,
  inputFor: (before: PackageRow) => UpdatePackageInput,
): Promise<void> {
  const today = await agencyToday(ctx);
  // Told of a departure the change left alone when its leads have no owner: those who manage departures.
  const managers = await ctx.identity.membersHolding(ctx.member.organizationId, "departures:edit");
  await ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
    const before = await findPackage(tx, packageId);
    const input = inputFor(before);
    await updatePackage(tx, ctx.member, input);
    // Making departures is departures work: skipped, silently, for a member or a plan without it.
    if (scheduleChanged(before, input) && mayMakeDepartures(ctx)) {
      await reconcilePackageDepartures(tx, ctx.member, packageId, today, managers);
      await generatePackageDepartures(tx, ctx.member, packageId, today);
    }
  });
}
