// Applying the ticked AI changes: only the member's own proposed run, its own change ids, never one the role may not make,
// and never on a trip that changed since it was shown; everything in one transaction (one failure and nothing changes),
// audited once besides each operation's own entries, keeping what Undo all needs.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyPackageChanges } from "../../../src/ai/package-changes/apply.js";
import { tripSnapshot, tripStamp } from "../../../src/ai/package-changes/trip-snapshot.js";
import { seasonsOf } from "../../../src/quotes/index.js";
import type { MemberAccess } from "../../../src/identity/index.js";
import { openWorld, type World } from "../../bookings/support.js";
import { aBookingOn } from "../../departures/support.js";
import { aTrip, assistantIn, context, NOW, reasonOf, TODAY, type Trip } from "./support.js";

const message = [
  "Holi 1 Mar to 10 Mar double 7499",
  "New departures 8 Jan and 15 Jan",
  "4 Dec batch only 30 seats",
  "Carry ID proof",
  "Start selling it on the AI",
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
  { kind: "note_add", line: "Carry ID proof", lines: ["L4"] },
  { kind: "ai_selling", on: true, lines: ["L5"] },
];

describe("applying AI changes", () => {
  let world: World;
  let assistant: Awaited<ReturnType<typeof assistantIn>>;
  beforeAll(async () => {
    world = await openWorld("Apply changes");
    assistant = await assistantIn(world);
  });
  afterAll(() => world.close());

  const apply = (runId: string, changeIds: string[], member: MemberAccess = world.manager) =>
    world.inOrg((tx) => applyPackageChanges(tx, member, { runId, changeIds }, context));
  const stateOf = (trip: Trip) =>
    world.inOrg(async (tx) => ({
      seasons: await seasonsOf(tx, trip.packageId),
      notes: (await tx.quoteTemplate.findUniqueOrThrow({ where: { id: trip.packageId }, select: { notes: true } }))
        .notes,
      departures: await tx.departure.findMany({
        where: { templateId: trip.packageId },
        orderBy: { startDate: "asc" },
        select: { id: true, startDate: true, seatsTotal: true, status: true },
      }),
    }));

  it("applies a season, two departures, a seat change and a note in one go, audited once, keeping the before-values", async () => {
    const trip = await aTrip(world);
    const proposal = await assistant.propose(trip, message, changes);
    const before = await stateOf(trip);
    expect(await apply(proposal.runId, ["c1", "c2", "c3", "c4"])).toEqual({ applied: 4 });

    const after = await stateOf(trip);
    expect(after.seasons.map((season) => [season.label, season.startsOn, season.endsOn, season.prices.double])).toEqual(
      [
        ["Regular", "2026-01-01", "2026-12-17", 699_900],
        ["Christmas", "2026-12-18", "2027-01-01", 899_900],
        ["Regular", "2027-01-02", "2027-02-28", 699_900],
        ["Holi", "2027-03-01", "2027-03-10", 749_900],
        ["Regular", "2027-03-11", "2099-12-31", 699_900],
      ],
    );
    const days = after.departures.map((one) => one.startDate.toISOString().slice(0, 10));
    expect(days).toEqual(expect.arrayContaining(["2027-01-08", "2027-01-15"]));
    expect(after.departures.find((one) => one.id === trip.departures.dec4)?.seatsTotal).toBe(30);
    expect(after.notes).toBe("Carry ID proof\nCarry warm clothes\nNo refunds after departure");

    const run = await world.inOrg((tx) => tx.packageChangeRun.findUniqueOrThrow({ where: { id: proposal.runId } }));
    expect(run).toMatchObject({ status: "applied", appliedChangeIds: ["c1", "c2", "c3", "c4"] });
    expect(run.appliedAt).not.toBeNull();
    const kept = run.before as {
      seasons: unknown[];
      fields: Record<string, unknown>;
      departures: { id: string; seatsTotal: number }[];
      createdDepartureIds: string[];
    };
    expect(kept.seasons).toEqual(before.seasons);
    expect(kept.fields).toEqual({ notes: "Carry warm clothes\nNo refunds after departure" });
    expect(kept.departures).toEqual([expect.objectContaining({ id: trip.departures.dec4, seatsTotal: 40 })]);
    expect(kept.createdDepartureIds).toHaveLength(2);
    expect(run.stampAfter).toBe(tripStamp(await world.inOrg((tx) => tripSnapshot(tx, trip.packageId, TODAY, NOW))));

    const audit = await world.inOrg((tx) =>
      tx.auditEntry.findMany({
        where: { entityId: trip.packageId },
        orderBy: { id: "asc" },
        select: { action: true, after: true },
      }),
    );
    const applied = audit.filter((entry) => entry.action === "package.ai-changes-applied");
    expect(applied).toEqual([{ action: "package.ai-changes-applied", after: { runId: proposal.runId, applied: 4 } }]);
    expect(audit.some((entry) => entry.action === "package.season-saved")).toBe(true);
    expect(audit.some((entry) => entry.action === "quote-package.changed")).toBe(true);
  });

  it("changes nothing when one change fails", async () => {
    const trip = await aTrip(world);
    const proposal = await assistant.propose(trip, message, changes);
    const before = await stateOf(trip);
    // The trip lacks what the AI needs to sell it, so the last change is refused and the rest rolls back.
    expect(await reasonOf(apply(proposal.runId, ["c1", "c2", "c3", "c4", "c5"]))).toBe("PACKAGE_NOT_READY_TO_SELL");
    expect(await stateOf(trip)).toEqual(before);
    const run = await world.inOrg((tx) => tx.packageChangeRun.findUniqueOrThrow({ where: { id: proposal.runId } }));
    expect(run.status).toBe("proposed");
  });

  it("refuses another member's run, another agency's, a used run and an unknown change", async () => {
    const trip = await aTrip(world);
    const proposal = await assistant.propose(trip, message, changes);
    const someoneElse = { ...world.manager, userId: randomUUID() };
    expect(await reasonOf(apply(proposal.runId, ["c4"], someoneElse))).toBe("NOT_FOUND");
    const other = await openWorld("Apply changes, other agency");
    try {
      expect(
        await reasonOf(
          other.inOrg((tx) =>
            applyPackageChanges(tx, other.manager, { runId: proposal.runId, changeIds: ["c4"] }, context),
          ),
        ),
      ).toBe("NOT_FOUND");
    } finally {
      await other.close();
    }
    expect(await reasonOf(apply(proposal.runId, ["c4", "c9"]))).toBe("NOT_FOUND");
    await apply(proposal.runId, ["c4"]);
    expect(await reasonOf(apply(proposal.runId, ["c1"]))).toBe("PACKAGE_CHANGES_USED");
  });

  it("refuses a change the member's role may not make", async () => {
    const trip = await aTrip(world);
    // Sales may edit trips but not change a departure.
    const proposal = await assistant.propose(trip, message, changes, world.seller);
    expect(proposal.changes.find((change) => change.id === "c3")?.flags).toContain("not_allowed");
    expect(await reasonOf(apply(proposal.runId, ["c3", "c4"], world.seller))).toBe("MISSING_PERMISSION");
    expect(await apply(proposal.runId, ["c4"], world.seller)).toEqual({ applied: 1 });
  });

  it("refuses when the trip changed since the changes were shown, changing nothing", async () => {
    const trip = await aTrip(world);
    const proposal = await assistant.propose(trip, message, changes);
    await world.inOrg((tx) =>
      tx.quoteTemplate.update({ where: { id: trip.packageId }, data: { pickupPoints: "Majnu ka Tilla at 7 pm" } }),
    );
    const before = await stateOf(trip);
    expect(await reasonOf(apply(proposal.runId, ["c1", "c4"]))).toBe("TRIP_CHANGED_SINCE");
    expect(await stateOf(trip)).toEqual(before);
  });
  it("adds a season with no end until the next one (here, with no end), splitting the regular price", async () => {
    const trip = await aTrip(world);
    const proposal = await assistant.propose(trip, "From 1 Mar new rates double 7499", [
      {
        kind: "season_add",
        label: "Spring",
        from: "1 Mar",
        to: null,
        prices: [{ room: "double", printed: "7,499" }],
        lines: ["L1"],
      },
    ]);
    expect(proposal.changes[0]).toMatchObject({ startsOn: "2027-03-01", endsOn: null, flags: [] });
    await apply(proposal.runId, ["c1"]);
    const after = await stateOf(trip);
    expect(after.seasons.slice(-2).map((season) => [season.label, season.startsOn, season.endsOn])).toEqual([
      ["Regular", "2027-01-02", "2027-02-28"],
      ["Spring", "2027-03-01", "2099-12-31"],
    ]);
  });

  it("refuses to cancel a departure that took a booking since the changes were shown", async () => {
    const trip = await aTrip(world);
    const proposal = await assistant.propose(trip, "4 Dec batch cancelled", [
      { kind: "departure_cancel", departure: "D1", reason: "Snow", lines: ["L1"] },
    ]);
    expect(proposal.changes[0]?.flags).toEqual([]);
    await aBookingOn(world, trip.departures.dec4, { adults: 2 });
    expect(await reasonOf(apply(proposal.runId, ["c1"]))).toBe("TRIP_CHANGED_SINCE");
  });

  it("counts only what changed: a day someone added meanwhile is no change", async () => {
    const trip = await aTrip(world);
    // 2 Jul 2027 already departs, past the 26 weeks the assistant reads, so it is offered.
    const proposal = await assistant.propose(trip, "New departure 2 Jul 2027\nCarry ID proof", [
      { kind: "departures_add", dates: ["2 Jul"], weekly: null, lines: ["L1"] },
      { kind: "note_add", line: "Carry ID proof", lines: ["L2"] },
    ]);
    expect(proposal.changes[0]).toMatchObject({ kind: "departures_add", dates: ["2027-07-02"] });
    expect(await apply(proposal.runId, ["c1", "c2"])).toEqual({ applied: 1 });
    const run = await world.inOrg((tx) => tx.packageChangeRun.findUniqueOrThrow({ where: { id: proposal.runId } }));
    expect(run.appliedChangeIds).toEqual(["c2"]);
  });
});
