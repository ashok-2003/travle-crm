// A trip's departures as Undo all needs them: each one's status (and why it was cancelled), seats and own prices, and
// whether the schedule made it, read before and after an apply, so what the apply (and the schedule it changed) touched
// or made can be put back.
import type { PackageChangeRunBefore } from "@travel-crm/contracts/ai";
import { roomTypes, type RoomPrices } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { departurePriceColumn } from "../../quotes/index.js";

/** A departure as the run keeps it. */
export type DepartureState = PackageChangeRunBefore["departures"][number];
/** A departure as it is now: also whether the schedule made it for its day (the generator may open it again). */
export type DepartureNow = DepartureState & { scheduled: boolean };

/** Every live departure of the trip, by id. */
export async function departureStates(tx: OrgTx, packageId: string): Promise<Map<string, DepartureNow>> {
  const rows = await tx.departure.findMany({
    where: { templateId: packageId },
    select: {
      id: true,
      startDate: true,
      scheduledOn: true,
      status: true,
      cancelledReason: true,
      seatsTotal: true,
      priceSinglePaise: true,
      priceDoublePaise: true,
      priceTriplePaise: true,
      priceQuadPaise: true,
      priceChildBedPaise: true,
      priceChildNoBedPaise: true,
    },
  });
  return new Map(
    rows.map((row) => {
      const ownPrices = Object.fromEntries(
        roomTypes.map((type) => {
          const paise = row[departurePriceColumn[type]];
          return [type, paise === null ? null : Number(paise)];
        }),
      ) as RoomPrices;
      return [
        row.id,
        {
          id: row.id,
          startDate: row.startDate.toISOString().slice(0, 10),
          status: row.status as DepartureState["status"],
          cancelledReason: row.cancelledReason,
          seatsTotal: row.seatsTotal,
          ownPrices,
          scheduled: row.scheduledOn?.getTime() === row.startDate.getTime(),
        },
      ];
    }),
  );
}

const same = (first: DepartureState, second: DepartureState) =>
  first.status === second.status &&
  first.seatsTotal === second.seatsTotal &&
  roomTypes.every((type) => first.ownPrices[type] === second.ownPrices[type]);

/** What the apply did to departures: the ones it changed (as they were) and the ones it made. */
export function departuresTouched(
  before: ReadonlyMap<string, DepartureNow>,
  after: ReadonlyMap<string, DepartureNow>,
): Pick<PackageChangeRunBefore, "departures" | "createdDepartureIds"> {
  return {
    departures: [...before.values()].flatMap((was) => {
      const now = after.get(was.id);
      if (now === undefined || same(was, now)) return [];
      const { id, startDate, status, cancelledReason, seatsTotal, ownPrices } = was;
      return [{ id, startDate, status, cancelledReason, seatsTotal, ownPrices }];
    }),
    createdDepartureIds: [...after.keys()].filter((id) => !before.has(id)),
  };
}
