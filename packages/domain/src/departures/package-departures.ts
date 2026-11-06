// The departures of a group package, made from its weekly days: every night, and when the package's days change, each
// matching day of the next twelve weeks that has no departure yet gets one. A day staff cancelled or deleted is a day
// they decided about, so it is never made again.
import { withDeleted, type OrgTx } from "@travel-crm/db";
import { organizationTimeZone } from "../identity/index.js";
import { addDays, calendarDateIn, systemActor, type Actor, type CalendarDate } from "../kernel/index.js";
import type { RoomPrices } from "@travel-crm/contracts/quotes";
import { forEachFullAccessAgency } from "../subscriptions/index.js";
import { createDeparture } from "./departures.js";
import type { DepartureJobDependencies } from "./due-work.js";
import { asDate, dayOf } from "./rows.js";

/** How far ahead departures are made: twelve weeks. */
export const DEPARTURE_HORIZON_DAYS = 84;
/** The queue of the nightly look. */
export const PACKAGE_DEPARTURES_QUEUE = "packages.generate-departures";

const noPrices: RoomPrices = {
  single: null,
  double: null,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
};

/** Makes the package's missing departures from tomorrow on. Returns how many it made. */
export async function generatePackageDepartures(
  tx: OrgTx,
  actor: Actor,
  packageId: string,
  today: CalendarDate,
): Promise<{ created: number }> {
  const pack = await tx.quoteTemplate.findUnique({
    where: { id: packageId },
    select: {
      name: true,
      kind: true,
      nights: true,
      seatsPerDeparture: true,
      weeklyDays: true,
      departureMonths: true,
      destinationId: true,
    },
  });
  if (
    pack?.kind !== "group" ||
    pack.weeklyDays.length === 0 ||
    pack.nights === null ||
    pack.seatsPerDeparture === null
  ) {
    return { created: 0 };
  }
  const first = addDays(today, 1);
  const last = addDays(today, DEPARTURE_HORIZON_DAYS);
  const taken = new Set(
    (
      await withDeleted(() =>
        tx.departure.findMany({
          where: { templateId: packageId, startDate: { gte: asDate(first), lte: asDate(last) } },
          select: { startDate: true },
        }),
      )
    ).map((row) => dayOf(row.startDate)),
  );
  let created = 0;
  for (let offset = 1; offset <= DEPARTURE_HORIZON_DAYS; offset += 1) {
    const day = addDays(today, offset);
    const weekday = asDate(day).getUTCDay();
    const month = Number(day.slice(5, 7));
    if (!pack.weeklyDays.includes(weekday)) continue;
    if (pack.departureMonths.length > 0 && !pack.departureMonths.includes(month)) continue;
    if (taken.has(day)) continue;
    const made = await createDeparture(tx, actor, {
      title: pack.name,
      destinationId: pack.destinationId,
      startDate: day,
      endDate: addDays(day, pack.nights),
      seatsTotal: pack.seatsPerDeparture,
      pricePaise: null,
      cutoffOn: null,
      notes: "",
      templateId: packageId,
      prices: noPrices,
    });
    // The day the schedule made it for: a schedule change tells it from one staff added or moved.
    await tx.departure.update({ where: { id: made.id }, data: { scheduledOn: asDate(day) } });
    created += 1;
  }
  return { created };
}

/** Every agency's group packages get their coming departures. Returns how many were made. */
export async function runPackageDepartures(dependencies: DepartureJobDependencies, now: Date): Promise<number> {
  return forEachFullAccessAgency(
    dependencies,
    "Making the departures of a package failed for an agency",
    async (agency) => {
      // A plan without the departures module gets none made for it.
      if (!(await dependencies.subscriptions.entitlementsOf(agency.id))?.modules.has("departures")) return 0;
      return dependencies.db.forOrg(agency.id, async (tx) => {
        const timeZone = await organizationTimeZone(tx, agency.id);
        const today = calendarDateIn(now, timeZone);
        const packages = await tx.quoteTemplate.findMany({
          where: { kind: "group", weeklyDays: { isEmpty: false } },
          select: { id: true },
        });
        let made = 0;
        for (const pack of packages)
          made += (await generatePackageDepartures(tx, systemActor(agency.id), pack.id, today)).created;
        return made;
      });
    },
  );
}
