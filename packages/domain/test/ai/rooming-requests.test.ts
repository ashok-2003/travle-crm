// Rooming requests read by the AI (release ai3): off until the agency turns the AI on; nothing to read costs no call; the model
// is told the notes and no contact or amount; only a known traveller, one of the three requests and words that really are in the
// notes are kept; nothing is saved by the reading; the apply is the rooming list's own update, audited as drafted by AI with what
// the member changed; the month's call is given back when the AI fails or finds nothing.
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readRoomRequests, recordRoomRequestsApplied } from "../../src/ai/index.js";
import { setRoomRequests } from "../../src/departures/index.js";
import { aBookingOn, aDeparture, now, openWorld, type World } from "../departures/support.js";

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("rooming requests read by the AI", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Rooming AI");
  });
  afterAll(() => world.close());

  async function departureWithNotes(options: { aiOn?: boolean; note?: string } = {}) {
    const departure = await world.inOrg((tx) => aDeparture(tx));
    const booking = await aBookingOn(world, departure.id, { adults: 2, confirmed: true });
    const travellers = await world.inOrg((tx) =>
      tx.bookingTraveller.findMany({ where: { bookingId: booking.bookingId }, orderBy: { position: "asc" } }),
    );
    await world.inOrg(async (tx) => {
      await tx.bookingTraveller.update({
        where: { id: travellers[0]?.id ?? "" },
        data: { name: "Asha Rao", roomNote: options.note ?? "my mother cannot climb stairs, ground floor please" },
      });
      await tx.bookingTraveller.update({ where: { id: travellers[1]?.id ?? "" }, data: { name: "Meera Rao" } });
      if (options.aiOn !== false) {
        await tx.aiSettings.upsert({
          where: { organizationId: world.organizationId },
          create: { enabled: true },
          update: { enabled: true },
        });
      }
    });
    const model = createMemoryAiModel();
    const read = () => readRoomRequests({ db: world.db, model }, world.manager, { departureId: departure.id }, now);
    return { departure, travellers, model, read };
  }

  const calls = () => world.inOrg((tx) => tx.aiUsage.findMany());

  it("is off until the agency turns the AI on", async () => {
    const { read, model } = await departureWithNotes({ aiOn: false });
    // Another test may have turned it on for this agency: turn it off here.
    await world.inOrg((tx) => tx.aiSettings.updateMany({ data: { enabled: false } }));
    expect(await reasonOf(read())).toBe("AI_OFF");
    expect(model.requests).toHaveLength(0);
  });

  it("proposes only a known traveller, one of the three requests and words that are in the notes, and saves nothing", async () => {
    const { read, model, travellers, departure } = await departureWithNotes();
    model.answer(
      JSON.stringify({
        requests: [
          { traveller: "B1T1", request: "ground_floor", excerpt: "cannot climb stairs, ground floor" },
          { traveller: "B1T2", request: "single_room", excerpt: "wants a room alone" },
          { traveller: "B9T1", request: "single_room", excerpt: "ground floor please" },
          { traveller: "B1T1", request: "none", excerpt: "ground floor please" },
        ],
      }),
    );
    const before = (await calls())[0]?.calls ?? 0;
    const proposal = await read();
    expect(proposal.suggestions).toEqual([
      {
        travellerId: travellers[0]?.id,
        name: "Asha Rao",
        bookingNumber: expect.stringMatching(/^BK-/) as string,
        current: "none",
        proposed: "ground_floor",
        excerpt: "cannot climb stairs, ground floor",
      },
    ]);
    expect(proposal.fillId).not.toBeNull();
    expect(proposal.usedThisMonth).toBe(before + 1);
    const [request] = model.requests;
    expect(request?.feature).toBe("read_requests");
    const prompt = JSON.stringify(request?.messages);
    expect(prompt).toContain("cannot climb stairs");
    expect(prompt).toContain("Meera Rao");
    expect(prompt).not.toMatch(/\+91|@|₹/);
    // Nothing is saved by the reading.
    const row = await world.inOrg((tx) =>
      tx.bookingTraveller.findUniqueOrThrow({ where: { id: travellers[0]?.id ?? "" } }),
    );
    expect(row.roomRequest).toBe("none");
    const fill = await world.inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: proposal.fillId ?? "" } }));
    expect(fill).toMatchObject({ target: "room_requests", subjectId: departure.id, appliedAt: null });
    expect(JSON.stringify(fill)).not.toContain("stairs");
  });

  it("cuts a group that would pass the cap of 80 travellers at the cap", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 200 }));
    const booking = await aBookingOn(world, departure.id, { adults: 85, confirmed: true });
    const rows = await world.inOrg((tx) =>
      tx.bookingTraveller.findMany({ where: { bookingId: booking.bookingId }, orderBy: { position: "asc" } }),
    );
    expect(rows.length).toBeGreaterThan(80);
    await world.inOrg(async (tx) => {
      await tx.bookingTraveller.update({ where: { id: rows[0]?.id ?? "" }, data: { roomNote: "ground floor please" } });
      await tx.aiSettings.upsert({
        where: { organizationId: world.organizationId },
        create: { enabled: true },
        update: { enabled: true },
      });
    });
    const model = createMemoryAiModel();
    model.answer(JSON.stringify({ requests: [] }));
    await readRoomRequests({ db: world.db, model }, world.manager, { departureId: departure.id }, now);
    const prompt = JSON.stringify(model.requests[0]?.messages);
    expect(prompt).toContain("B1T80");
    expect(prompt).not.toContain("B1T81");
  });

  it("costs no call and asks nothing when no traveller has a note", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx));
    await aBookingOn(world, departure.id, { adults: 1, confirmed: true });
    await world.inOrg((tx) =>
      tx.aiSettings.upsert({
        where: { organizationId: world.organizationId },
        create: { enabled: true },
        update: { enabled: true },
      }),
    );
    const model = createMemoryAiModel();
    const before = await calls();
    const reason = await reasonOf(
      readRoomRequests({ db: world.db, model }, world.manager, { departureId: departure.id }, now),
    );
    expect(reason).toBe("ROOMING_NOTHING_TO_READ");
    expect(model.requests).toHaveLength(0);
    expect(await calls()).toEqual(before);
  });

  it("leaves a traveller who already has a request alone", async () => {
    const { read, model, travellers } = await departureWithNotes();
    await world.inOrg((tx) =>
      tx.bookingTraveller.update({ where: { id: travellers[0]?.id ?? "" }, data: { roomRequest: "near_group" } }),
    );
    expect(await reasonOf(read())).toBe("ROOMING_NOTHING_TO_READ");
    expect(model.requests).toHaveLength(0);
  });

  it("gives the call back when the AI does not answer or finds nothing", async () => {
    const { read, model } = await departureWithNotes();
    const before = (await calls())[0]?.calls ?? 0;
    model.answer({ ok: false, reason: "unavailable" });
    expect(await reasonOf(read())).toBe("AI_UNAVAILABLE");
    expect((await calls())[0]?.calls ?? 0).toBe(before);
    model.answer(
      JSON.stringify({ requests: [{ traveller: "B1T1", request: "single_room", excerpt: "not in the notes" }] }),
    );
    const none = await read();
    expect(none).toMatchObject({ fillId: null, suggestions: [] });
    expect((await calls())[0]?.calls ?? 0).toBe(before);
  });

  it("applies through the rooming list's own update, audited as drafted by AI with what the member changed, once", async () => {
    const { read, model, travellers, departure } = await departureWithNotes();
    model.answer(
      JSON.stringify({
        requests: [
          { traveller: "B1T1", request: "ground_floor", excerpt: "ground floor please" },
          { traveller: "B1T2", request: "near_group", excerpt: "ground floor please" },
        ],
      }),
    );
    const proposal = await read();
    const fillId = proposal.fillId ?? "";
    expect(proposal.suggestions).toHaveLength(2);
    const changes = [
      { travellerId: travellers[0]?.id ?? "", roomRequest: "ground_floor" as const },
      // The member chose another request for the second traveller than the AI proposed.
      { travellerId: travellers[1]?.id ?? "", roomRequest: "single_room" as const },
    ];
    await world.inOrg(async (tx) => {
      await setRoomRequests(tx, world.manager, { departureId: departure.id, changes }, now);
      await recordRoomRequestsApplied(tx, world.manager, { fillId, departureId: departure.id, applied: changes }, now);
    });
    const rows = await world.inOrg((tx) =>
      tx.bookingTraveller.findMany({ where: { id: { in: changes.map((one) => one.travellerId) } } }),
    );
    expect(Object.fromEntries(rows.map((row) => [row.id, row.roomRequest]))).toEqual({
      [changes[0]?.travellerId ?? ""]: "ground_floor",
      [changes[1]?.travellerId ?? ""]: "single_room",
    });
    const fill = await world.inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: fillId } }));
    expect(fill.appliedBy).toBe(world.manager.userId);
    expect(fill.appliedFields).toHaveLength(2);
    expect(fill.changedFields).toEqual([changes[1]?.travellerId]);
    const entries = await world.inOrg((tx) => tx.auditEntry.findMany({ where: { entityId: fillId } }));
    expect(entries).toMatchObject([
      { action: "ai.fill-applied", after: { target: "room_requests", count: 2, changedByMember: 1 } },
    ]);
    expect(
      await world.inOrg((tx) =>
        tx.auditEntry.count({ where: { entityId: departure.id, action: "departure.room-requests-set" } }),
      ),
    ).toBe(1);
    // The same save again changes nothing more; another member's use of the reading is refused.
    await world.inOrg((tx) =>
      recordRoomRequestsApplied(tx, world.manager, { fillId, departureId: departure.id, applied: changes }, now),
    );
    expect(
      await reasonOf(
        world.inOrg((tx) =>
          recordRoomRequestsApplied(tx, world.seller, { fillId, departureId: departure.id, applied: changes }, now),
        ),
      ),
    ).toBe("NOT_FOUND");
  });

  it("refuses a traveller who is not on the departure", async () => {
    const { departure } = await departureWithNotes();
    const other = await world.inOrg((tx) => aDeparture(tx, { title: "Other" }));
    const foreign = await aBookingOn(world, other.id, { adults: 1, confirmed: true });
    const traveller = await world.inOrg((tx) =>
      tx.bookingTraveller.findFirstOrThrow({ where: { bookingId: foreign.bookingId } }),
    );
    expect(
      await reasonOf(
        world.inOrg((tx) =>
          setRoomRequests(
            tx,
            world.manager,
            { departureId: departure.id, changes: [{ travellerId: traveller.id, roomRequest: "single_room" }] },
            now,
          ),
        ),
      ),
    ).toBe("NOT_FOUND");
  });
});
