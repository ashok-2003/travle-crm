// A group trip for the AI change assistant's tests: "Hill town 4N/5D", sold in double and triple rooms, a regular price
// with no end split around a Christmas season, Friday departures (one cancelled), notes, details and an itinerary.
import { noRoomPrices, OPEN_SEASON_END, type RoomPrices } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { saveAiSettings } from "../../../src/ai/index.js";
import { proposePackageChanges } from "../../../src/ai/package-changes/propose.js";
import { createFiles } from "../../../src/files/index.js";
import type { MemberAccess } from "../../../src/identity/index.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { savePackageSeason } from "../../../src/quotes/index.js";
import type { World } from "../../bookings/support.js";

export const NOW = new Date("2026-11-25T06:30:00Z");
export const TODAY = parseCalendarDate("2026-11-25");
export const none = noRoomPrices;
export const regularPrices: RoomPrices = { ...none, double: 699_900, triple: 599_900 };

export const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

let counter = 0;

const aDeparture = (tx: OrgTx, templateId: string, startDate: string, extra: object = {}) =>
  tx.departure.create({
    data: {
      title: "Hill town",
      templateId,
      startDate: new Date(`${startDate}T00:00:00Z`),
      endDate: new Date(new Date(`${startDate}T00:00:00Z`).getTime() + 4 * 86_400_000),
      seatsTotal: 40,
      ...extra,
    },
    select: { id: true },
  });

export async function aTrip(world: World) {
  counter += 1;
  return world.inOrg(async (tx) => {
    const trip = await tx.quoteTemplate.create({
      data: {
        name: `Hill town 4N/5D ${String(counter)}`,
        title: "Hill town",
        kind: "group",
        nights: 4,
        roomTypes: ["double", "triple"],
        seatsPerDeparture: 40,
        advancePerPersonPaise: 200_000n,
        weeklyDays: [5],
        pickupPoints: "Delhi ISBT at 6 pm",
        startCity: "Delhi",
        inclusions: "Hotel\nBreakfast",
        exclusions: "Lunch",
        cancellationNotes: "50% charged within 15 days",
        notes: "Carry warm clothes\nNo refunds after departure",
        days: [{ title: "Delhi to the hills", description: "Overnight Volvo" }],
        summary: "A short hill trip",
      },
      select: { id: true },
    });
    const season = async (label: string, startsOn: string, endsOn: string, prices: RoomPrices) =>
      (await savePackageSeason(tx, world.manager, { packageId: trip.id, label, startsOn, endsOn, prices })).id;
    const regularBefore = await season("Regular", "2026-01-01", "2026-12-17", regularPrices);
    const christmas = await season("Christmas", "2026-12-18", "2027-01-01", { ...none, double: 899_900 });
    const regularAfter = await season("Regular", "2027-01-02", OPEN_SEASON_END, regularPrices);
    return {
      packageId: trip.id,
      seasons: { regularBefore, christmas, regularAfter },
      departures: {
        dec4: (await aDeparture(tx, trip.id, "2026-12-04")).id,
        dec11: (await aDeparture(tx, trip.id, "2026-12-11", { status: "cancelled", cancelledReason: "Snow" })).id,
        dec18: (await aDeparture(tx, trip.id, "2026-12-18", { priceDoublePaise: 949_900n })).id,
        // Past the 26 weeks the assistant reads.
        far: (await aDeparture(tx, trip.id, "2027-07-02")).id,
      },
    };
  });
}

export type Trip = Awaited<ReturnType<typeof aTrip>>;

/** What Apply and Undo all are told besides the run: today, now, the plan's departures, who hears of kept departures. */
export const context = { today: TODAY, now: NOW, departuresOnPlan: true, managerUserIds: [] };

/** Turns the AI on in the world and proposes changes to a trip with a scripted answer, as a member would. */
export async function assistantIn(world: World) {
  await world.inOrg((tx) =>
    saveAiSettings(tx, world.manager, { enabled: true, scoring: true }, { providerReady: true, now: NOW }),
  );
  const files = createFiles({ db: world.db, storage: createMemoryStorage() });
  return {
    propose(trip: Trip, text: string, changes: object[], member: MemberAccess = world.manager) {
      const model = createMemoryAiModel();
      model.answer(JSON.stringify({ changes }));
      return proposePackageChanges(
        { db: world.db, model, files, prompts: undefined },
        member,
        { packageId: trip.packageId, text, attachmentIds: [], answers: [] },
        NOW,
      );
    },
  };
}
