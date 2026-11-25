// Undo all: the trip's latest applied AI changes put back (seasons, fields, seats, own prices; created departures
// cancelled, reopened ones cancelled again, cancelled ones reopened), keeping a created departure that took a booking or
// a hold and saying so; refused when the trip changed since, or for a run that isn't the trip's latest applied one.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyPackageChanges } from "../../../src/ai/package-changes/apply.js";
import { latestPackageChangeRun } from "../../../src/ai/package-changes/latest.js";
import { undoPackageChanges } from "../../../src/ai/package-changes/undo.js";
import { seasonsOf } from "../../../src/quotes/index.js";
import { openWorld, type World } from "../../bookings/support.js";
import { aBookingOn, aSellersLead } from "../../departures/support.js";
import { aTrip, assistantIn, context, NOW, reasonOf, type Trip } from "./support.js";

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

    expect(await undo(runId)).toEqual({ undone: 8, kept: [] });
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
    expect(audit).toEqual([{ after: { runId, undone: 8, kept: 0 } }]);
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
  });
});
