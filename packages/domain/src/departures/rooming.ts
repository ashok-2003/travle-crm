// The rooming list's changes (release 7a): a departure's stays (a hotel with dates), a stay's rooms, who is in which room, and
// the draft that fills the rooms in one tap. Staff placing a traveller locks them there, so a new draft leaves them be. Every
// change takes the departure's lock, so two people working the same list take turns.
import type { AddRoomInput, MoveTravellerInput, SaveRoomingStayInput } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { draftRooms } from "./rooming-draft.js";
import { rosterOf } from "./rooming-rows.js";
import { asDate, departureSettingsOf, findDepartureForChange } from "./rows.js";

const missing = (what: string) => new DomainError("NOT_FOUND", "NOT_FOUND", `No such ${what}`);

async function stayOf(tx: OrgTx, stayId: string) {
  const stay = await tx.departureStay.findUnique({
    where: { id: stayId },
    select: { id: true, departureId: true, hotelName: true },
  });
  if (stay === null) throw missing("stay");
  await findDepartureForChange(tx, stay.departureId);
  return stay;
}

async function roomOf(tx: OrgTx, roomId: string) {
  const room = await tx.departureRoom.findUnique({
    where: { id: roomId },
    select: { id: true, stayId: true, capacity: true, label: true },
  });
  if (room === null) throw missing("room");
  const stay = await stayOf(tx, room.stayId);
  return { ...room, departureId: stay.departureId };
}

export async function saveRoomingStay(tx: OrgTx, access: MemberAccess, input: SaveRoomingStayInput): Promise<void> {
  if (input.checkOut < input.checkIn) {
    throw new DomainError("VALIDATION", "STAY_DATES_BACKWARDS", "Check-out is before check-in");
  }
  const departure = await findDepartureForChange(tx, input.departureId);
  const fields = {
    hotelName: input.hotelName,
    supplierId: input.supplierId,
    checkIn: asDate(input.checkIn),
    checkOut: asDate(input.checkOut),
  };
  let stayId: string;
  if (input.stayId === undefined) {
    const position = await tx.departureStay.count({ where: { departureId: departure.id } });
    stayId = (
      await tx.departureStay.create({ data: { departureId: departure.id, position, ...fields }, select: { id: true } })
    ).id;
  } else {
    const stay = await stayOf(tx, input.stayId);
    if (stay.departureId !== departure.id) throw missing("stay");
    stayId = stay.id;
    await tx.departureStay.update({ where: { id: stayId }, data: fields });
  }
  await recordAudit(tx, access, {
    action: "departure.stay-saved",
    entityType: "departure",
    entityId: departure.id,
    after: { stayId, hotelName: input.hotelName, checkIn: input.checkIn, checkOut: input.checkOut },
  });
}

export async function removeRoomingStay(tx: OrgTx, access: MemberAccess, stayId: string): Promise<void> {
  const stay = await stayOf(tx, stayId);
  await tx.departureRoomAssignment.deleteMany({ where: { stayId } });
  await tx.departureRoom.deleteMany({ where: { stayId } });
  await tx.departureStay.delete({ where: { id: stayId } });
  await recordAudit(tx, access, {
    action: "departure.stay-removed",
    entityType: "departure",
    entityId: stay.departureId,
    before: { stayId, hotelName: stay.hotelName },
  });
}

export async function addRoom(tx: OrgTx, access: MemberAccess, input: AddRoomInput): Promise<void> {
  const stay = await stayOf(tx, input.stayId);
  const position = await tx.departureRoom.count({ where: { stayId: stay.id } });
  const room = await tx.departureRoom.create({
    data: { stayId: stay.id, position, label: input.label, capacity: input.capacity, groundFloor: input.groundFloor },
    select: { id: true },
  });
  await recordAudit(tx, access, {
    action: "departure.room-saved",
    entityType: "departure",
    entityId: stay.departureId,
    after: { roomId: room.id, label: input.label, capacity: input.capacity },
  });
}

export async function updateRoom(
  tx: OrgTx,
  access: MemberAccess,
  input: { roomId: string; label: string; capacity: number; groundFloor: boolean },
): Promise<void> {
  const room = await roomOf(tx, input.roomId);
  const inside = await tx.departureRoomAssignment.count({ where: { roomId: room.id } });
  if (input.capacity < inside) throw new DomainError("CONFLICT", "ROOM_FULL", "More people are in this room than that");
  await tx.departureRoom.update({
    where: { id: room.id },
    data: { label: input.label, capacity: input.capacity, groundFloor: input.groundFloor },
  });
  await recordAudit(tx, access, {
    action: "departure.room-saved",
    entityType: "departure",
    entityId: room.departureId,
    after: { roomId: room.id, label: input.label, capacity: input.capacity },
  });
}

/** A removed room puts whoever was in it back under Unassigned. */
export async function removeRoom(tx: OrgTx, access: MemberAccess, roomId: string): Promise<void> {
  const room = await roomOf(tx, roomId);
  await tx.departureRoomAssignment.deleteMany({ where: { roomId } });
  await tx.departureRoom.delete({ where: { id: roomId } });
  await recordAudit(tx, access, {
    action: "departure.room-removed",
    entityType: "departure",
    entityId: room.departureId,
    before: { roomId, label: room.label },
  });
}

/** Staff put a traveller in a room (or take them out of every room of the stay); either way it is theirs to keep: locked. */
export async function moveTraveller(tx: OrgTx, access: MemberAccess, input: MoveTravellerInput): Promise<void> {
  const stay = await stayOf(tx, input.stayId);
  const roster = await rosterOf(tx, stay.departureId);
  if (!roster.some((traveller) => traveller.id === input.travellerId)) throw missing("traveller");
  await tx.departureRoomAssignment.deleteMany({ where: { stayId: stay.id, travellerId: input.travellerId } });
  if (input.roomId !== null) {
    const room = await tx.departureRoom.findUnique({
      where: { id: input.roomId },
      select: { id: true, stayId: true, capacity: true },
    });
    if (room?.stayId !== stay.id) throw missing("room");
    const inside = await tx.departureRoomAssignment.count({ where: { roomId: room.id } });
    if (inside >= room.capacity) throw new DomainError("CONFLICT", "ROOM_FULL", "This room is full");
    await tx.departureRoomAssignment.create({
      data: { stayId: stay.id, roomId: room.id, travellerId: input.travellerId, locked: true },
    });
  }
  await recordAudit(tx, access, {
    action: "departure.room-moved",
    entityType: "departure",
    entityId: stay.departureId,
    after: { stayId: stay.id, travellerId: input.travellerId, roomId: input.roomId },
  });
}

/**
 * Fills the stay's rooms: staff's placements (locked) stay, everyone else is placed again, the same way for the same input
 * (rooming-draft.ts). A stay with no rooms gets the rooms it needs. Returns how many are left Unassigned.
 */
export async function draftStayRooms(tx: OrgTx, access: MemberAccess, stayId: string): Promise<{ unassigned: number }> {
  const stay = await stayOf(tx, stayId);
  await tx.departureRoomAssignment.deleteMany({ where: { stayId, locked: false } });
  const [roster, settings, rooms, locked] = await Promise.all([
    rosterOf(tx, stay.departureId),
    departureSettingsOf(tx),
    tx.departureRoom.findMany({
      where: { stayId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true, capacity: true, groundFloor: true, position: true },
    }),
    tx.departureRoomAssignment.findMany({
      where: { stayId, locked: true },
      select: { travellerId: true, roomId: true },
    }),
  ]);
  const lockedIds = new Set(locked.map((assignment) => assignment.travellerId));
  const result = draftRooms(
    roster.filter((traveller) => !lockedIds.has(traveller.id)),
    rooms.map((room) => ({ ...room, occupied: locked.filter((assignment) => assignment.roomId === room.id).length })),
    settings.defaultRoomCapacity,
  );
  const made = new Map<string, string>();
  for (const [index, room] of result.newRooms.entries()) {
    const created = await tx.departureRoom.create({
      data: {
        stayId,
        position: room.position,
        label: String(index + 1),
        capacity: room.capacity,
        groundFloor: room.groundFloor,
      },
      select: { id: true },
    });
    made.set(room.id, created.id);
  }
  await tx.departureRoomAssignment.createMany({
    data: [...result.placed.entries()].map(([travellerId, roomId]) => ({
      stayId,
      roomId: made.get(roomId) ?? roomId,
      travellerId,
      locked: false,
    })),
  });
  await recordAudit(tx, access, {
    action: "departure.rooms-drafted",
    entityType: "departure",
    entityId: stay.departureId,
    after: { stayId, placed: result.placed.size, unassigned: result.unassigned.length },
  });
  return { unassigned: result.unassigned.length };
}

/**
 * Repeats this stay's layout (its rooms and who is in them) at the departure's other stays that have no rooms yet; a stay
 * with rooms is left as it is. Returns how many stays were given the layout.
 */
export async function copyStayLayout(tx: OrgTx, access: MemberAccess, stayId: string): Promise<{ copied: number }> {
  const stay = await stayOf(tx, stayId);
  const [rooms, assignments, others] = await Promise.all([
    tx.departureRoom.findMany({
      where: { stayId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true, label: true, capacity: true, groundFloor: true, position: true },
    }),
    tx.departureRoomAssignment.findMany({
      where: { stayId },
      select: { roomId: true, travellerId: true, locked: true },
    }),
    tx.departureStay.findMany({
      where: { departureId: stay.departureId, id: { not: stayId }, rooms: { none: {} } },
      select: { id: true },
    }),
  ]);
  for (const other of others) {
    const made = new Map<string, string>();
    for (const room of rooms) {
      const { id } = await tx.departureRoom.create({
        data: {
          stayId: other.id,
          label: room.label,
          capacity: room.capacity,
          groundFloor: room.groundFloor,
          position: room.position,
        },
        select: { id: true },
      });
      made.set(room.id, id);
    }
    await tx.departureRoomAssignment.createMany({
      data: assignments.flatMap((assignment) => {
        const roomId = made.get(assignment.roomId);
        return roomId === undefined
          ? []
          : [{ stayId: other.id, roomId, travellerId: assignment.travellerId, locked: assignment.locked }];
      }),
    });
  }
  if (others.length > 0) {
    await recordAudit(tx, access, {
      action: "departure.layout-copied",
      entityType: "departure",
      entityId: stay.departureId,
      after: { fromStayId: stayId, stays: others.length },
    });
  }
  return { copied: others.length };
}
