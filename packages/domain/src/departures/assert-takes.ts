// The rule for taking a party on a departure, shared by a group quote and a booking made straight from the list: the departure
// is of this package and open, its first day and cut-off have not passed, and it has the seats.
import type { OrgTx } from "@travel-crm/db";
import { DomainError, type CalendarDate } from "../kernel/index.js";
import { countsOf, dayOf, seatsSoldAndHeld, type DepartureRow } from "./rows.js";

export async function assertDepartureTakes(
  tx: OrgTx,
  departure: DepartureRow,
  packageId: string | null,
  people: number,
  today: CalendarDate,
  now: Date,
): Promise<void> {
  const cutoff = departure.cutoffOn === null ? null : dayOf(departure.cutoffOn);
  if (
    departure.templateId !== packageId ||
    departure.status !== "open" ||
    dayOf(departure.startDate) < today ||
    (cutoff !== null && cutoff < today)
  ) {
    throw new DomainError("CONFLICT", "DEPARTURE_NOT_OPEN", "This departure is not open for booking");
  }
  const found = (await seatsSoldAndHeld(tx, [departure.id], now)).get(departure.id) ?? { sold: 0, held: 0 };
  if (people > countsOf(departure.seatsTotal, found.sold, found.held).free) {
    throw new DomainError("CONFLICT", "NOT_ENOUGH_SEATS", "There aren't that many seats free on this departure");
  }
}
