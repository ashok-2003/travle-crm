// The rooming list (release 7a): the draft puts each booking's party together, honours requests, pairs solo travellers by
// gender, and gives the same rooms for the same input; staff's placements stay put; a room over its capacity is refused; the
// PDF is numbered and goes out of date when the rooms change; the CSV can't run a formula.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addRoom,
  copyStayLayout,
  draftRooms,
  draftStayRooms,
  getRooming,
  issueRoomingList,
  moveTraveller,
  needRoommateDecision,
  removeRoom,
  removeRoomingStay,
  roomingCsvOf,
  saveRoomingStay,
  updateRoom,
} from "../../src/departures/index.js";
import type { DraftRoom, DraftTraveller } from "../../src/departures/rooming-draft.js";
import { aBookingOn, aDeparture, now, openWorld, type World } from "./support.js";

const person = (
  id: string,
  bookingNumber: string,
  position: number,
  extra: Partial<DraftTraveller> = {},
): DraftTraveller => ({ id, bookingNumber, position, gender: null, roomRequest: "none", ...extra });
const room = (id: string, capacity: number, extra: Partial<DraftRoom> = {}): DraftRoom => ({
  id,
  capacity,
  groundFloor: false,
  position: Number(id.replace(/\D/g, "")) || 0,
  occupied: 0,
  ...extra,
});

describe("drafting the rooms", () => {
  it("keeps a booking's party together, two to a room", () => {
    const result = draftRooms(
      [
        person("a1", "BK-1", 0),
        person("a2", "BK-1", 1),
        person("a3", "BK-1", 2),
        person("b1", "BK-2", 0),
        person("b2", "BK-2", 1),
      ],
      [room("r1", 2), room("r2", 2), room("r3", 2)],
      2,
    );
    expect(result.unassigned).toEqual([]);
    expect(result.placed.get("a1")).toBe(result.placed.get("a2"));
    expect(result.placed.get("a3")).not.toBe(result.placed.get("a1"));
    expect(result.placed.get("b1")).toBe(result.placed.get("b2"));
    expect(new Set(result.placed.values()).size).toBe(3);
  });

  it("gives a single-room request a room of their own and sends ground-floor requests to ground-floor rooms first", () => {
    const result = draftRooms(
      [
        person("s", "BK-1", 0, { roomRequest: "single_room" }),
        person("g1", "BK-2", 0, { roomRequest: "ground_floor" }),
        person("g2", "BK-2", 1),
        person("n1", "BK-3", 0),
        person("n2", "BK-3", 1),
      ],
      [room("r1", 2), room("r2", 2, { groundFloor: true }), room("r3", 1)],
      2,
    );
    expect(result.placed.get("s")).toBe("r3");
    expect(result.placed.get("g1")).toBe("r2");
    expect(result.placed.get("g2")).toBe("r2");
    expect(result.placed.get("n1")).toBe("r1");
    expect(result.unassigned).toEqual([]);
  });

  it("pairs solo travellers of the same gender and leaves one of unknown gender alone, flagged", () => {
    const people = [
      person("f1", "BK-1", 0, { gender: "female" }),
      person("m1", "BK-2", 0, { gender: "male" }),
      person("f2", "BK-3", 0, { gender: "female" }),
      person("u", "BK-4", 0),
      person("m2", "BK-5", 0, { gender: "male" }),
    ];
    const result = draftRooms(people, [room("r1", 2), room("r2", 2), room("r3", 2)], 2);
    expect(result.placed.get("f1")).toBe(result.placed.get("f2"));
    expect(result.placed.get("m1")).toBe(result.placed.get("m2"));
    expect(result.placed.get("u")).not.toBe(result.placed.get("f1"));
    expect([...needRoommateDecision(people)]).toEqual(["u"]);
  });

  it("leaves whoever finds no room under Unassigned, and makes the same rooms for the same input", () => {
    const people = [person("a1", "BK-1", 0), person("a2", "BK-1", 1), person("b1", "BK-2", 0), person("b2", "BK-2", 1)];
    const first = draftRooms(people, [room("r1", 2)], 2);
    expect(first.unassigned).toEqual(["b1", "b2"]);
    const again = draftRooms([...people].reverse(), [room("r1", 2)], 2);
    expect([...again.placed.entries()].sort()).toEqual([...first.placed.entries()].sort());
  });

  it("makes the rooms it needs when the stay has none", () => {
    const result = draftRooms(
      [person("a1", "BK-1", 0), person("a2", "BK-1", 1), person("s", "BK-2", 0, { roomRequest: "single_room" })],
      [],
      2,
    );
    expect(result.unassigned).toEqual([]);
    expect(result.newRooms.map((made) => made.capacity).sort()).toEqual([1, 2]);
  });

  it("keeps rooms staff already filled out of the draft", () => {
    const result = draftRooms(
      [person("a", "BK-1", 0), person("b", "BK-1", 1)],
      [room("r1", 2, { occupied: 1 }), room("r2", 2)],
      2,
    );
    expect(result.placed.get("a")).toBe("r2");
  });
});

describe("a departure's rooming list", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Departure rooming");
  });
  afterAll(async () => {
    await world.close();
  });

  const branding = { organizationName: "Sharma Holidays" };

  async function departureWithStay() {
    const departure = await world.inOrg((tx) => aDeparture(tx));
    const first = await aBookingOn(world, departure.id, { adults: 2, confirmed: true });
    const second = await aBookingOn(world, departure.id, { adults: 1, confirmed: true });
    await world.inOrg((tx) =>
      saveRoomingStay(tx, world.manager, {
        departureId: departure.id,
        hotelName: "Hotel Snow",
        supplierId: null,
        checkIn: "2026-11-03",
        checkOut: "2026-11-05",
      }),
    );
    const stay = (await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0];
    return { departure, stayId: stay?.id ?? "", first, second };
  }

  it("lists every traveller under Unassigned until the rooms are drafted, then fills them", async () => {
    const { departure, stayId } = await departureWithStay();
    const before = (await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0];
    expect(before).toMatchObject({ hotelName: "Hotel Snow", rooms: [], documentState: "none" });
    expect(before?.unassigned).toHaveLength(3);
    expect(await world.inOrg((tx) => draftStayRooms(tx, world.manager, stayId))).toEqual({ unassigned: 0 });
    const after = (await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0];
    expect(after?.unassigned).toEqual([]);
    expect(after?.rooms.map((one) => one.travellers.length).sort()).toEqual([1, 2]);
    const solo = after?.rooms.flatMap((one) => one.travellers).find((one) => one.needsRoommateDecision);
    expect(solo).toBeDefined();
  });

  it("locks a traveller staff move, refuses a full room, and keeps the locked one through a new draft", async () => {
    const { departure, stayId } = await departureWithStay();
    await world.inOrg((tx) => draftStayRooms(tx, world.manager, stayId));
    const rooms = (await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0]?.rooms ?? [];
    const pair = rooms.find((one) => one.travellers.length === 2);
    const alone = rooms.find((one) => one.travellers.length === 1);
    const mover = alone?.travellers[0];
    await expect(
      world.inOrg((tx) =>
        moveTraveller(tx, world.manager, { stayId, travellerId: mover?.travellerId ?? "", roomId: pair?.id ?? "" }),
      ),
    ).rejects.toMatchObject({ reason: "ROOM_FULL" });
    await world.inOrg((tx) => addRoom(tx, world.manager, { stayId, label: "Suite", capacity: 3, groundFloor: true }));
    const suite = (await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0]?.rooms.find(
      (one) => one.label === "Suite",
    );
    await world.inOrg((tx) =>
      moveTraveller(tx, world.manager, { stayId, travellerId: mover?.travellerId ?? "", roomId: suite?.id ?? "" }),
    );
    await world.inOrg((tx) => draftStayRooms(tx, world.manager, stayId));
    const after = (await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0];
    const placed = after?.rooms.find((one) => one.label === "Suite")?.travellers ?? [];
    expect(placed).toMatchObject([{ travellerId: mover?.travellerId, locked: true }]);
    await world.inOrg((tx) =>
      moveTraveller(tx, world.manager, { stayId, travellerId: mover?.travellerId ?? "", roomId: null }),
    );
    expect(
      (await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0]?.unassigned.map((one) => one.travellerId),
    ).toContain(mover?.travellerId);
    await expect(
      world.inOrg((tx) =>
        updateRoom(tx, world.manager, { roomId: pair?.id ?? "", label: "101", capacity: 1, groundFloor: false }),
      ),
    ).rejects.toMatchObject({ reason: "ROOM_FULL" });
  });

  it("issues a numbered PDF, gives the same one back until the rooms change, then reads out of date", async () => {
    const { departure, stayId, first } = await departureWithStay();
    await expect(world.inOrg((tx) => issueRoomingList(tx, world.manager, stayId, branding, now))).rejects.toMatchObject(
      {
        reason: "ROOMING_EMPTY",
      },
    );
    await world.inOrg((tx) => draftStayRooms(tx, world.manager, stayId));
    const one = await world.inOrg((tx) => issueRoomingList(tx, world.manager, stayId, branding, now));
    expect(one.number).toMatch(/^RML-2026-\d{4}$/);
    expect(await world.inOrg((tx) => issueRoomingList(tx, world.manager, stayId, branding, now))).toEqual(one);
    expect((await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0]?.documentState).toBe("current");
    const traveller = await world.inOrg((tx) =>
      tx.bookingTraveller.findFirstOrThrow({ where: { bookingId: first.bookingId } }),
    );
    await world.inOrg((tx) =>
      tx.bookingTraveller.update({
        where: { id: traveller.id },
        data: { roomRequest: "ground_floor", roomNote: "knee" },
      }),
    );
    expect((await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0]?.documentState).toBe("out_of_date");
    const two = await world.inOrg((tx) => issueRoomingList(tx, world.manager, stayId, branding, now));
    expect(two.documentId).not.toBe(one.documentId);
  });

  it("exports a CSV of names and requests that cannot run as a formula", async () => {
    const { stayId, first } = await departureWithStay();
    const traveller = await world.inOrg((tx) =>
      tx.bookingTraveller.findFirstOrThrow({ where: { bookingId: first.bookingId } }),
    );
    await world.inOrg((tx) =>
      tx.bookingTraveller.update({
        where: { id: traveller.id },
        data: { name: '=HYPERLINK("x")', roomNote: "late, arrival" },
      }),
    );
    await world.inOrg((tx) => draftStayRooms(tx, world.manager, stayId));
    const csv = await world.inOrg((tx) => roomingCsvOf(tx, stayId));
    expect(csv.filename).toBe("rooming-hotel-snow-2026-11-03.csv");
    const lines = csv.content.trim().split("\r\n");
    expect(lines[0]).toBe('"Hotel","Check-in","Check-out","Room","Guest","Request","Note"');
    expect(lines.some((line) => line.includes('"\'=HYPERLINK(""x"")"'))).toBe(true);
    expect(lines.some((line) => line.includes('"late, arrival"'))).toBe(true);
    expect(csv.content).not.toMatch(/@|\+91|₹/);
  });

  it("copies a stay's layout to the stays with no rooms, and drops rooms and stays cleanly", async () => {
    const { departure, stayId } = await departureWithStay();
    await world.inOrg((tx) =>
      saveRoomingStay(tx, world.manager, {
        departureId: departure.id,
        hotelName: "Hotel Peak",
        supplierId: null,
        checkIn: "2026-11-05",
        checkOut: "2026-11-07",
      }),
    );
    await world.inOrg((tx) => draftStayRooms(tx, world.manager, stayId));
    expect(await world.inOrg((tx) => copyStayLayout(tx, world.manager, stayId))).toEqual({ copied: 1 });
    expect(await world.inOrg((tx) => copyStayLayout(tx, world.manager, stayId))).toEqual({ copied: 0 });
    const stays = (await world.inOrg((tx) => getRooming(tx, departure.id))).stays;
    expect(stays).toHaveLength(2);
    expect(stays[1]?.rooms.length).toBe(stays[0]?.rooms.length);
    expect(stays[1]?.unassigned).toEqual([]);
    const gone = stays[0]?.rooms[0];
    await world.inOrg((tx) => removeRoom(tx, world.manager, gone?.id ?? ""));
    expect((await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0]?.unassigned.length).toBeGreaterThan(0);
    await world.inOrg((tx) => removeRoomingStay(tx, world.manager, stayId));
    expect((await world.inOrg((tx) => getRooming(tx, departure.id))).stays).toHaveLength(1);
  });

  it("refuses a stay that checks out before it checks in", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx));
    await expect(
      world.inOrg((tx) =>
        saveRoomingStay(tx, world.manager, {
          departureId: departure.id,
          hotelName: "Hotel Snow",
          supplierId: null,
          checkIn: "2026-11-05",
          checkOut: "2026-11-03",
        }),
      ),
    ).rejects.toMatchObject({ reason: "STAY_DATES_BACKWARDS" });
  });

  it("never puts more people in a room than it holds when two staff fill it at once", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx));
    await aBookingOn(world, departure.id, { adults: 3, confirmed: true });
    await world.inOrg((tx) =>
      saveRoomingStay(tx, world.manager, {
        departureId: departure.id,
        hotelName: "Hotel Snow",
        supplierId: null,
        checkIn: "2026-11-03",
        checkOut: "2026-11-05",
      }),
    );
    const stay = (await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0];
    const stayId = stay?.id ?? "";
    await world.inOrg((tx) => addRoom(tx, world.manager, { stayId, label: "101", capacity: 2, groundFloor: false }));
    const roomId = (await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0]?.rooms[0]?.id ?? "";
    const people = (await world.inOrg((tx) => getRooming(tx, departure.id))).stays[0]?.unassigned ?? [];
    const results = await Promise.allSettled(
      people.map((person) =>
        world.inOrg((tx) => moveTraveller(tx, world.manager, { stayId, travellerId: person.travellerId, roomId })),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(await world.inOrg((tx) => tx.departureRoomAssignment.count({ where: { roomId } }))).toBe(2);
  });
});
