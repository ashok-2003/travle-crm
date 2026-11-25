// Putting back what an AI apply replaced, through the trip's own operations: the seasons as they were (new ones removed,
// changed ones restored, removed ones made again), and the departures (added ones cancelled, the rest given back their
// status, seats and own prices). A departure that took a booking or a hold since stays, and is reported.
import type { PackageChangeRunBefore, UndoPackageChangesResult } from "@travel-crm/contracts/ai";
import { roomTypes, type PackageSeasonView } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import {
  cancelDeparture,
  reopenCancelledDeparture,
  seatsSoldAndHeld,
  setDeparturePrices,
  setDepartureSeats,
} from "../../departures/index.js";
import type { MemberAccess } from "../../identity/index.js";
import type { CalendarDate } from "../../kernel/index.js";
import { removePackageSeason, savePackageSeason, seasonsOf } from "../../quotes/index.js";
import { departureStates } from "./departure-states.js";

/** Why Undo all cancels a departure the apply added. */
export const UNDO_CANCEL_REASON = "Added by AI changes that were undone";

type Kept = UndoPackageChangesResult["kept"][number];

const sameSeason = (first: PackageSeasonView, second: PackageSeasonView) =>
  first.label === second.label &&
  first.startsOn === second.startsOn &&
  first.endsOn === second.endsOn &&
  roomTypes.every((type) => first.prices[type] === second.prices[type]);

/** Removed first, then shrunk ones grown back, then removed ones made again: no write ever overlaps another season. */
export async function restoreSeasons(
  tx: OrgTx,
  access: MemberAccess,
  packageId: string,
  before: readonly PackageSeasonView[],
): Promise<void> {
  const now = await seasonsOf(tx, packageId);
  const was = new Map(before.map((season) => [season.id, season]));
  const save = (season: PackageSeasonView, seasonId?: string) =>
    savePackageSeason(tx, access, {
      packageId,
      ...(seasonId === undefined ? {} : { seasonId }),
      label: season.label,
      startsOn: season.startsOn,
      endsOn: season.endsOn,
      prices: season.prices,
    });
  for (const season of now) if (!was.has(season.id)) await removePackageSeason(tx, access, season.id);
  for (const season of now) {
    const old = was.get(season.id);
    if (old !== undefined && !sameSeason(old, season)) await save(old, season.id);
  }
  const present = new Set(now.map((season) => season.id));
  for (const old of before) if (!present.has(old.id)) await save(old);
}

/** The departures put back; the ones kept because of a booking or a hold, earliest first. */
export async function restoreDepartures(
  tx: OrgTx,
  access: MemberAccess,
  packageId: string,
  before: PackageChangeRunBefore,
  context: { today: CalendarDate; now: Date },
): Promise<Kept[]> {
  const ids = [...before.createdDepartureIds, ...before.departures.map((one) => one.id)];
  const sales = await seatsSoldAndHeld(tx, ids, context.now);
  const states = await departureStates(tx, packageId);
  const kept = new Map<string, Kept>();
  /** Why a departure must stay as it is: a booking, else a hold; null when it has neither. */
  const busy = (departureId: string, seats = 0): Kept["reason"] | null => {
    const found = sales.get(departureId) ?? { sold: 0, held: 0 };
    if (found.sold + found.held <= seats) return null;
    return found.sold > 0 ? "has_bookings" : "has_holds";
  };
  const keep = (departureId: string, startDate: string, reason: Kept["reason"]) => {
    if (!kept.has(departureId)) kept.set(departureId, { departureId, startDate, reason });
  };

  for (const id of before.createdDepartureIds) {
    const state = states.get(id);
    if (state === undefined || state.status === "cancelled") continue;
    const reason = busy(id);
    if (reason !== null) keep(id, state.startDate, reason);
    else await cancelDeparture(tx, access, { departureId: id, reason: UNDO_CANCEL_REASON }, context.now);
  }
  for (const was of before.departures) {
    const state = states.get(was.id);
    if (state === undefined) continue;
    if (was.status === "cancelled" && state.status !== "cancelled") {
      const reason = busy(was.id);
      if (reason !== null) keep(was.id, was.startDate, reason);
      else {
        const why = was.cancelledReason ?? UNDO_CANCEL_REASON;
        await cancelDeparture(tx, access, { departureId: was.id, reason: why }, context.now);
      }
      continue;
    }
    // A day already gone can't be opened again: it stays as it is.
    if (was.status !== "cancelled" && state.status === "cancelled" && was.startDate >= context.today) {
      await reopenCancelledDeparture(tx, access, was.id, context.today);
    }
    if (state.seatsTotal !== was.seatsTotal) {
      const reason = busy(was.id, was.seatsTotal);
      if (reason !== null) keep(was.id, was.startDate, reason);
      else await setDepartureSeats(tx, access, { departureId: was.id, seatsTotal: was.seatsTotal }, context.now);
    }
    if (roomTypes.some((type) => state.ownPrices[type] !== was.ownPrices[type])) {
      await setDeparturePrices(tx, access, { departureId: was.id, prices: was.ownPrices });
    }
  }
  return [...kept.values()].sort((first, second) => first.startDate.localeCompare(second.startDate));
}
