// Undo all: the trip's latest applied AI changes put back (seasons, fields, seats, own prices; created departures
// cancelled, reopened ones cancelled again, cancelled ones reopened), keeping a created departure that took a booking or
// a hold and saying so; refused when the trip changed since, or for a run that isn't the trip's latest applied one.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyPackageChanges } from "../../../src/ai/package-changes/apply.js";
import { cancelDeparture, generatePackageDepartures, SCHEDULE_CANCEL_REASON } from "../../../src/departures/index.js";
import { addDays, systemActor } from "../../../src/kernel/index.js";
import { latestPackageChangeRun } from "../../../src/ai/package-changes/latest.js";
import { undoPackageChanges } from "../../../src/ai/package-changes/undo.js";
import { seasonsOf } from "../../../src/quotes/index.js";
import { openWorld, type World } from "../../bookings/support.js";
import { aBookingOn, aSellersLead } from "../../departures/support.js";
import { aTrip, assistantIn, context, NOW, reasonOf, TODAY, type Trip } from "./support.js";

const message = [
  "Holi 1 Mar to 10 Mar double 7499",
  "New departures 8 Jan and 15 Jan",
  "4 Dec batch only 30 seats",
  "18 Dec batch double 9999",
  "11 Dec batch is back on",
  "Pickup from Majnu ka Tilla at 6 pm",
  "Warm clothes not needed now",
  "Christmas double now 9499",
].join("\n");
const changes = [
  {
    kind: "season_add",
    label: "Holi",
    from: "1 Mar",
    to: "10 Mar",
    prices: [{ room: "double", printed: "7,499" }],
    lines: ["L1"],
  },
  { kind: "departures_add", dates: ["8 Jan", "15 Jan"], weekly: null, lines: ["L2"] },
  { kind: "departure_seats", departure: "D1", seats: "30", lines: ["L3"] },
  { kind: "departure_prices", departure: "D3", prices: [{ room: "double", printed: "9,999" }], lines: ["L4"] },
  { kind: "departure_reopen", departure: "D2", lines: ["L5"] },
  { kind: "trip_field", field: "pickupPoints", value: "Majnu ka Tilla at 6 pm", lines: ["L6"] },
  { kind: "note_remove", note: "N1", lines: ["L7"] },
  { kind: "season_change", season: "S2", label: null, prices: [{ room: "double", printed: "9,499" }], lines: ["L8"] },
];
const all = changes.map((_, index) => `c${String(index + 1)}`);

describe("undoing AI changes", () => {
  let world: World;
  let assistant: Awaited<ReturnType<typeof assistantIn>>;
  beforeAll(async () => {
    world = await openWorld("Undo changes");
    assistant = await assistantIn(world);
  });
  afterAll(() => world.close());

  const apply = (runId: string, changeIds: string[]) =>
    world.inOrg((tx) => applyPackageChanges(tx, world.manager, { runId, changeIds }, context));
  const undo = (runId: string) => world.inOrg((tx) => undoPackageChanges(tx, world.manager, { runId }, context));
  const latest = (trip: Trip) => world.inOrg((tx) => latestPackageChangeRun(tx, trip.packageId, NOW));
  const stateOf = (trip: Trip) =>
    world.inOrg(async (tx) => ({
      seasons: (await seasonsOf(tx, trip.packageId)).map(({ label, startsOn, endsOn, prices }) => ({
        label,
        startsOn,
        endsOn,
        prices,
      })),
      fields: await tx.quoteTemplate.findUniqueOrThrow({
        where: { id: trip.packageId },
        select: { notes: true, pickupPoints: true },
      }),
      departures: await tx.departure.findMany({
        where: { templateId: trip.packageId },
        orderBy: { startDate: "asc" },
        select: { startDate: true, seatsTotal: true, status: true, priceDoublePaise: true },
      }),
    }));
  const appliedRun = async (trip: Trip, ids = all) => {
    const proposal = await assistant.propose(trip, message, changes);
    expect(proposal.changes.map((change) => change.flags)).toEqual(changes.map(() => []));
    await apply(proposal.runId, ids);
    return proposal.runId;
  };

  it("puts back seasons, fields, seats and own prices, cancels what it added and what it reopened", async () => {
    const trip = await aTrip(world);
    const before = await stateOf(trip);
    const runId = await appliedRun(trip);
    expect(await latest(trip)).toMatchObject({ runId, applied: 8, undoable: true });

    expect(await undo(runId)).toEqual({ undone: 8, kept: [], sellingNotRestored: false });
    const after = await stateOf(trip);
    expect(after.seasons).toEqual(before.seasons);
    expect(after.fields).toEqual(before.fields);
    // The two days it added stay on the calendar, cancelled; the rest are as they were.
    const added = (day: string) => after.departures.find((one) => one.startDate.toISOString().startsWith(day));
    expect(added("2027-01-08")?.status).toBe("cancelled");
    expect(added("2027-01-15")?.status).toBe("cancelled");
    expect(
      after.departures.filter(
        (one) => !["2027-01-08", "2027-01-15"].includes(one.startDate.toISOString().slice(0, 10)),
      ),
    ).toEqual(before.departures);

    const run = await world.inOrg((tx) => tx.packageChangeRun.findUniqueOrThrow({ where: { id: runId } }));
    expect(run.status).toBe("undone");
    const audit = await world.inOrg((tx) =>
      tx.auditEntry.findMany({
        where: { entityId: trip.packageId, action: "package.ai-changes-undone" },
        select: { after: true },
      }),
    );
    expect(audit).toEqual([{ after: { runId, undone: 8, kept: 0, sellingNotRestored: false } }]);
    expect(await latest(trip)).toBeNull();
  });

  it("keeps an added departure that took a booking or a hold, and says which", async () => {
    const trip = await aTrip(world);
    const runId = await appliedRun(trip, ["c2", "c3"]);
    const added = await world.inOrg((tx) =>
      tx.departure.findMany({
        where: { templateId: trip.packageId, startDate: { in: [new Date("2027-01-08"), new Date("2027-01-15")] } },
        orderBy: { startDate: "asc" },
        select: { id: true },
      }),
    );
    const [booked, held] = added.map((one) => one.id);
    if (booked === undefined || held === undefined) throw new Error("The departures were not added");
    await aBookingOn(world, booked, { adults: 2 });
    const lead = await aSellersLead(world);
    await world.inOrg((tx) =>
      tx.departureHold.create({
        data: { departureId: held, leadId: lead.id, seats: 2, expiresAt: new Date("2026-12-01T00:00:00Z") },
      }),
    );

    expect(await undo(runId)).toEqual({
      undone: 2,
      kept: [
        { departureId: booked, startDate: "2027-01-08", reason: "has_bookings" },
        { departureId: held, startDate: "2027-01-15", reason: "has_holds" },
      ],
      sellingNotRestored: false,
    });
    const rows = await world.inOrg((tx) =>
      tx.departure.findMany({
        where: { id: { in: [booked, held, trip.departures.dec4] } },
        select: { id: true, status: true, seatsTotal: true },
      }),
    );
    expect(rows.find((row) => row.id === booked)?.status).toBe("open");
    expect(rows.find((row) => row.id === held)?.status).toBe("open");
    expect(rows.find((row) => row.id === trip.departures.dec4)?.seatsTotal).toBe(40);
  });

  it("refuses when the trip changed after the changes were applied", async () => {
    const trip = await aTrip(world);
    const runId = await appliedRun(trip, ["c6"]);
    await world.inOrg((tx) =>
      tx.quoteTemplate.update({ where: { id: trip.packageId }, data: { exclusions: "Lunch, tips" } }),
    );
    expect(await latest(trip)).toMatchObject({ runId, undoable: false });
    expect(await reasonOf(undo(runId))).toBe("TRIP_CHANGED_SINCE");
    const run = await world.inOrg((tx) => tx.packageChangeRun.findUniqueOrThrow({ where: { id: runId } }));
    expect(run.status).toBe("applied");
  });

  it("refuses a run that isn't the trip's latest applied one", async () => {
    const trip = await aTrip(world);
    const first = await appliedRun(trip, ["c6"]);
    const proposed = await assistant.propose(trip, message, changes);
    // Only proposed: nothing to undo, and the first is still the latest applied.
    expect(await reasonOf(undo(proposed.runId))).toBe("PACKAGE_CHANGES_NOT_UNDOABLE");
    await apply(proposed.runId, ["c7"]);
    expect(await reasonOf(undo(first))).toBe("PACKAGE_CHANGES_NOT_UNDOABLE");
    await undo(proposed.runId);
    expect(await reasonOf(undo(proposed.runId))).toBe("PACKAGE_CHANGES_NOT_UNDOABLE");
  });
  it("makes a changed schedule's departures, and Undo all cancels them and puts the schedule back", async () => {
    const trip = await aTrip(world);
    const proposal = await assistant.propose(trip, "From now on every Friday and Saturday", [
      { kind: "trip_field", field: "weeklyDays", value: ["Friday", "Saturday"], lines: ["L1"] },
    ]);
    const count = () =>
      world.inOrg((tx) => tx.departure.count({ where: { templateId: trip.packageId, status: { not: "cancelled" } } }));
    const before = await count();
    await apply(proposal.runId, ["c1"]);
    expect(await count()).toBeGreaterThan(before);

    // Sales may edit the trip but not cancel departures, so it can't undo this.
    expect(
      await reasonOf(world.inOrg((tx) => undoPackageChanges(tx, world.seller, { runId: proposal.runId }, context))),
    ).toBe("MISSING_PERMISSION");
    await undo(proposal.runId);
    expect(await count()).toBe(before);
    const row = await world.inOrg((tx) =>
      tx.quoteTemplate.findUniqueOrThrow({ where: { id: trip.packageId }, select: { weeklyDays: true } }),
    );
    expect(row.weeklyDays).toEqual([5]);
    // The schedule's own departures are cancelled as the schedule cancels, so its generator may make them again.
    const reasons = await world.inOrg((tx) =>
      tx.departure.findMany({
        where: { templateId: trip.packageId, scheduledOn: { not: null } },
        select: { cancelledReason: true },
      }),
    );
    expect(reasons.length).toBeGreaterThan(0);
    expect(new Set(reasons.map((one) => one.cancelledReason))).toEqual(new Set([SCHEDULE_CANCEL_REASON]));
  });

  it("stays offered while the nightly job makes the next departures, and not once staff change one", async () => {
    const trip = await aTrip(world);
    const runId = await appliedRun(trip, ["c6"]);
    // The next night: the schedule makes the Fridays it lacks, which is no change to the trip.
    const made = await world.inOrg((tx) =>
      generatePackageDepartures(tx, systemActor(world.organizationId), trip.packageId, addDays(TODAY, 1)),
    );
    expect(made.created).toBeGreaterThan(0);
    expect(await latest(trip)).toMatchObject({ runId, undoable: true });

    const scheduled = await world.inOrg((tx) =>
      tx.departure.findFirstOrThrow({ where: { templateId: trip.packageId, scheduledOn: { not: null } } }),
    );
    await world.inOrg((tx) =>
      cancelDeparture(tx, world.manager, { departureId: scheduled.id, reason: "Hotel closed" }, NOW),
    );
    expect(await latest(trip)).toMatchObject({ runId, undoable: false });
    expect(await reasonOf(undo(runId))).toBe("TRIP_CHANGED_SINCE");
  });

  it("says what it couldn't put back: a cancelled day now past, and an AI switch the trip can't have back", async () => {
    const trip = await aTrip(world);
    await world.inOrg((tx) => tx.quoteTemplate.update({ where: { id: trip.packageId }, data: { aiSellable: true } }));
    const proposal = await assistant.propose(trip, "4 Dec batch cancelled\nStop the AI selling it", [
      { kind: "departure_cancel", departure: "D1", reason: "Snow", lines: ["L1"] },
      { kind: "ai_selling", on: false, lines: ["L2"] },
    ]);
    await apply(proposal.runId, ["c1", "c2"]);
    // Undone after the 4th: the day can't be opened again. The trip lacks what selling needs, so the switch stays off.
    const later = { ...context, today: addDays(TODAY, 15) };
    expect(await world.inOrg((tx) => undoPackageChanges(tx, world.manager, { runId: proposal.runId }, later))).toEqual({
      undone: 2,
      kept: [{ departureId: trip.departures.dec4, startDate: "2026-12-04", reason: "past_date" }],
      sellingNotRestored: true,
    });
  });
});
