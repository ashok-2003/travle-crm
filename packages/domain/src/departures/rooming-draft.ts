// Drafting the rooms (release 7a, spec 5.9 in plain code, no AI): who sleeps where, worked out the same way every time from
// the same input. Each booking's party stays together; a single-room request gets a room to themselves; a ground-floor
// request goes to ground-floor rooms first (and everyone else keeps off them while other rooms are free); a solo traveller
// is paired only with a solo of the same gender, and one whose gender is unknown stays alone, flagged for a decision.
// Whoever finds no room is Unassigned. A room is used by one party at a time; a stay with no rooms at all gets the rooms the
// draft needs. Pure: no database here.
import type { RoomRequest } from "@travel-crm/contracts/departures";

export interface DraftTraveller {
  id: string;
  bookingNumber: string;
  position: number;
  gender: "female" | "male" | "other" | null;
  roomRequest: RoomRequest;
}

export interface DraftRoom {
  /** The room's id, or a temporary one for a room the draft makes. */
  id: string;
  capacity: number;
  groundFloor: boolean;
  /** Where staff put it in the list. */
  position: number;
  /** Heads already placed in it by staff (locked): the room is not free for a party. */
  occupied: number;
}

export interface DraftResult {
  /** traveller id -> room id. */
  placed: Map<string, string>;
  unassigned: string[];
  /** Rooms the draft made because the stay had none. */
  newRooms: DraftRoom[];
}

interface Party {
  bookingNumber: string;
  members: DraftTraveller[];
}

const byOrder = (a: DraftTraveller, b: DraftTraveller) =>
  a.bookingNumber.localeCompare(b.bookingNumber) || a.position - b.position || a.id.localeCompare(b.id);

function partiesOf(travellers: readonly DraftTraveller[]): Party[] {
  const byBooking = new Map<string, DraftTraveller[]>();
  for (const traveller of [...travellers].sort(byOrder)) {
    byBooking.set(traveller.bookingNumber, [...(byBooking.get(traveller.bookingNumber) ?? []), traveller]);
  }
  return [...byBooking.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bookingNumber, members]) => ({ bookingNumber, members }));
}

/**
 * The travellers of unknown gender who travel alone (the only head on their booking who shares a room): they stay in a room
 * to themselves until staff decide who they room with.
 */
export function needRoommateDecision(travellers: readonly DraftTraveller[]): Set<string> {
  const found = new Set<string>();
  for (const party of partiesOf(travellers)) {
    const sharing = party.members.filter((member) => member.roomRequest !== "single_room");
    const only = sharing[0];
    if (sharing.length === 1 && only?.gender === null) found.add(only.id);
  }
  return found;
}

/**
 * @param travellers everyone to place (not those staff locked in place)
 * @param rooms the stay's rooms, with the heads staff already placed counted in `occupied`
 * @param defaultCapacity heads to a room when the draft makes the rooms itself
 */
export function draftRooms(
  travellers: readonly DraftTraveller[],
  rooms: readonly DraftRoom[],
  defaultCapacity: number,
): DraftResult {
  const makesRooms = rooms.length === 0;
  const pool: DraftRoom[] = rooms.map((room) => ({ ...room }));
  const newRooms: DraftRoom[] = [];
  const placed = new Map<string, string>();
  const unassigned: string[] = [];

  /**
   * Takes a free room for `size` heads: ground-floor ones first when `ground`, others when not; the smallest that fits. A stay
   * with no rooms gets one made, of `madeCapacity` heads.
   */
  const take = (size: number, ground: boolean, madeCapacity: number): DraftRoom | null => {
    const free = pool
      .filter((room) => room.occupied === 0 && room.capacity >= size)
      .sort(
        (a, b) =>
          Number(ground ? !a.groundFloor : a.groundFloor) - Number(ground ? !b.groundFloor : b.groundFloor) ||
          a.capacity - b.capacity ||
          a.position - b.position ||
          a.id.localeCompare(b.id),
      );
    const found = free[0];
    if (found) {
      found.occupied = size;
      return found;
    }
    if (!makesRooms) return null;
    const made: DraftRoom = {
      id: `new-${String(newRooms.length + 1)}`,
      capacity: Math.max(size, madeCapacity),
      groundFloor: ground,
      position: rooms.length + newRooms.length,
      occupied: size,
    };
    newRooms.push(made);
    pool.push(made);
    return made;
  };

  const place = (members: readonly DraftTraveller[], room: DraftRoom | null) => {
    for (const member of members) {
      if (room === null) unassigned.push(member.id);
      else placed.set(member.id, room.id);
    }
  };

  const parties = partiesOf(travellers);
  // 1. Single-room requests, each alone in a one-bed room (or the smallest free room).
  for (const party of parties) {
    for (const member of party.members.filter((one) => one.roomRequest === "single_room")) {
      place([member], take(1, false, 1));
    }
  }
  const shared = parties.map((party) => ({
    ...party,
    members: party.members.filter((member) => member.roomRequest !== "single_room"),
  }));
  // 2. Parties of two or more, ground-floor ones first, each chunk of a party in a room of its own.
  const groups = shared.filter((party) => party.members.length > 1);
  const wantsGround = (party: Party) => party.members.some((member) => member.roomRequest === "ground_floor");
  for (const party of [...groups.filter(wantsGround), ...groups.filter((one) => !wantsGround(one))]) {
    const ground = wantsGround(party);
    for (let from = 0; from < party.members.length; from += defaultCapacity) {
      const chunk = party.members.slice(from, from + defaultCapacity);
      place(chunk, take(chunk.length, ground, defaultCapacity));
    }
  }
  // 3. Solo travellers, paired by gender (and by wanting the ground floor); an odd one out, or one of unknown gender, alone.
  const solos = shared.flatMap((party) => {
    const only = party.members[0];
    return party.members.length === 1 && only !== undefined ? [only] : [];
  });
  const pairing = new Map<string, DraftTraveller[]>();
  const alone: DraftTraveller[] = [];
  for (const solo of solos) {
    if (solo.gender === null) {
      alone.push(solo);
      continue;
    }
    const key = `${solo.gender}:${solo.roomRequest === "ground_floor" ? "ground" : "any"}`;
    pairing.set(key, [...(pairing.get(key) ?? []), solo]);
  }
  const pairSize = Math.min(2, defaultCapacity);
  for (const key of [...pairing.keys()].sort()) {
    const people = pairing.get(key) ?? [];
    for (let from = 0; from < people.length; from += pairSize) {
      const chunk = people.slice(from, from + pairSize);
      place(chunk, take(chunk.length, key.endsWith(":ground"), defaultCapacity));
    }
  }
  for (const solo of alone) place([solo], take(1, solo.roomRequest === "ground_floor", 1));
  return { placed, unassigned, newRooms };
}
