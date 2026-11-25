// Staff add a group trip's dates in bulk: a departure for each chosen day of a range, skipping days that already hold one
// (a cancelled one is reported so staff can open it again instead).
import type { AddPackageDatesInput, AddPackageDatesResult } from "@travel-crm/contracts/departures";
import type { RoomPrices } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { addDays, DomainError, parseCalendarDate, type Actor, type CalendarDate } from "../kernel/index.js";
import { createDeparture } from "./departures.js";
import { asDate, dayOf } from "./rows.js";

const noPrices: RoomPrices = {
  single: null,
  double: null,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
};

/** Adds the departures. Returns the days it added, the days that already had one, and the days holding a cancelled one. */
export async function addPackageDates(
  tx: OrgTx,
  actor: Actor,
  input: AddPackageDatesInput,
  today: CalendarDate,
): Promise<AddPackageDatesResult> {
  if (input.from <= today) {
    throw new DomainError("VALIDATION", "DATES_NOT_AHEAD", "Dates can only be added from tomorrow on");
  }
  const pack = await tx.quoteTemplate.findUnique({
    where: { id: input.packageId },
    select: { name: true, kind: true, nights: true, seatsPerDeparture: true, destinationId: true },
  });
  if (pack?.kind !== "group") throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such group package");
  if (pack.nights === null || pack.seatsPerDeparture === null) {
    throw new DomainError(
      "VALIDATION",
      "PACKAGE_SCHEDULE_INCOMPLETE",
      "The trip needs its nights and seats per departure first",
    );
  }
  const there = await tx.departure.findMany({
    where: { templateId: input.packageId, startDate: { gte: asDate(input.from), lte: asDate(input.to) } },
    select: { id: true, startDate: true, status: true },
  });
  const existing = new Map(there.map((row) => [dayOf(row.startDate), row]));
  const result: AddPackageDatesResult = { added: [], alreadyThere: [], cancelled: [] };
  for (let day = parseCalendarDate(input.from); day <= input.to; day = addDays(day, 1)) {
    if (input.weekdays.length > 0 && !input.weekdays.includes(asDate(day).getUTCDay())) continue;
    const row = existing.get(day);
    if (row?.status === "cancelled") {
      result.cancelled.push({ date: day, departureId: row.id });
    } else if (row !== undefined) {
      result.alreadyThere.push(day);
    } else {
      await createDeparture(tx, actor, {
        title: pack.name,
        destinationId: pack.destinationId,
        startDate: day,
        endDate: addDays(day, pack.nights),
        seatsTotal: pack.seatsPerDeparture,
        pricePaise: null,
        cutoffOn: null,
        notes: "",
        templateId: input.packageId,
        prices: noPrices,
      });
      result.added.push(day);
    }
  }
  return result;
}
