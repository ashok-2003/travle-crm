// The travellers a departure's rooming list is made for, and the rooming list as staff read it (release 7a): each stay with
// its rooms and who is in them, and who is left Unassigned. The roster is every traveller of a live Requested or Confirmed
// booking on the departure; a name not yet given reads "<customer>, traveller 2".
import { rooming, type Rooming, type RoomingTraveller, type RoomRequest } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { createHash } from "node:crypto";
import { needRoommateDecision, type DraftTraveller } from "./rooming-draft.js";
import { dayOf, findDeparture } from "./rows.js";

export interface RosterTraveller extends DraftTraveller {
  bookingId: string;
  name: string;
  customerName: string;
  roomNote: string;
}

export async function rosterOf(tx: OrgTx, departureId: string): Promise<RosterTraveller[]> {
  const bookings = await tx.booking.findMany({
    where: { departureId, status: { in: ["requested", "confirmed"] } },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      lead: { select: { person: { select: { name: true } } } },
      travellers: {
        orderBy: { position: "asc" },
        select: { id: true, position: true, name: true, gender: true, roomRequest: true, roomNote: true },
      },
    },
  });
  return bookings.flatMap((booking) =>
    booking.travellers.map((traveller) => ({
      id: traveller.id,
      bookingId: booking.id,
      bookingNumber: booking.number,
      position: traveller.position,
      name: traveller.name,
      customerName: booking.lead.person.name,
      gender: traveller.gender as RosterTraveller["gender"],
      roomRequest: traveller.roomRequest as RoomRequest,
      roomNote: traveller.roomNote,
    })),
  );
}

export const nameOf = (traveller: Pick<RosterTraveller, "name" | "customerName" | "position">): string =>
  traveller.name !== "" ? traveller.name : `${traveller.customerName}, traveller ${String(traveller.position + 1)}`;

/** What a rooming list PDF is made from: the stay, its rooms and who is in each with their requests. Changes when any does. */
export const roomingFingerprint = (
  stay: { hotelName: string; checkIn: Date; checkOut: Date },
  rooms: readonly { label: string; capacity: number; groundFloor: boolean; travellers: readonly RoomingTraveller[] }[],
): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        stay: [stay.hotelName, dayOf(stay.checkIn), dayOf(stay.checkOut)],
        rooms: rooms.map((room) => [
          room.label,
          room.capacity,
          room.groundFloor,
          room.travellers.map((one) => [one.name, one.roomRequest, one.roomNote]),
        ]),
      }),
    )
    .digest("hex")
    .slice(0, 32);

export async function getRooming(tx: OrgTx, departureId: string): Promise<Rooming> {
  const departure = await findDeparture(tx, departureId);
  const [roster, stays] = await Promise.all([
    rosterOf(tx, departure.id),
    tx.departureStay.findMany({
      where: { departureId: departure.id },
      orderBy: [{ checkIn: "asc" }, { position: "asc" }, { id: "asc" }],
      select: {
        id: true,
        hotelName: true,
        supplierId: true,
        checkIn: true,
        checkOut: true,
        roomingDocumentId: true,
        roomingFingerprint: true,
        rooms: {
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: { id: true, label: true, capacity: true, groundFloor: true },
        },
        assignments: { select: { roomId: true, travellerId: true, locked: true } },
      },
    }),
  ]);
  const aloneUnknown = needRoommateDecision(roster);
  const byId = new Map(roster.map((traveller) => [traveller.id, traveller]));
  const view = (traveller: RosterTraveller, locked: boolean): RoomingTraveller => ({
    travellerId: traveller.id,
    name: nameOf(traveller),
    bookingNumber: traveller.bookingNumber,
    roomRequest: traveller.roomRequest,
    roomNote: traveller.roomNote,
    locked,
    needsRoommateDecision: aloneUnknown.has(traveller.id),
  });
  return rooming.parse({
    travellers: roster.length,
    stays: stays.map((stay) => {
      // An assignment of a traveller no longer on the departure (cancelled, removed) is not shown.
      const placed = new Set(stay.assignments.filter((a) => byId.has(a.travellerId)).map((a) => a.travellerId));
      const rooms = stay.rooms.map((room) => ({
        ...room,
        travellers: stay.assignments.flatMap((assignment) => {
          const traveller = byId.get(assignment.travellerId);
          return assignment.roomId === room.id && traveller ? [view(traveller, assignment.locked)] : [];
        }),
      }));
      const stamp = roomingFingerprint(stay, rooms);
      return {
        id: stay.id,
        hotelName: stay.hotelName,
        supplierId: stay.supplierId,
        checkIn: dayOf(stay.checkIn),
        checkOut: dayOf(stay.checkOut),
        rooms,
        unassigned: roster.filter((traveller) => !placed.has(traveller.id)).map((traveller) => view(traveller, false)),
        documentState:
          stay.roomingDocumentId === null ? "none" : stay.roomingFingerprint === stamp ? "current" : "out_of_date",
        documentId: stay.roomingDocumentId,
      };
    }),
  });
}
