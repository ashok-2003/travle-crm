// Isolation fixtures for the departures module: a departure with its holds, waitlist, stays, rooms and room assignments, and
// the settings. A departure and a hold are kept (soft delete or status), as are the settings, so the runtime role deletes
// none of them; a waitlist entry, a stay, a room and an assignment are plain data it may delete.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const aDeparture = (tx: OrgTx) =>
  tx.departure.create({
    data: {
      title: "Isolation departure",
      startDate: new Date("2026-12-01"),
      endDate: new Date("2026-12-05"),
      seatsTotal: 20,
    },
  });

const aLead = async (tx: OrgTx) => {
  const person = await tx.person.create({
    data: { name: "Isolation person", email: `departure-${randomUUID()}@example.test` },
  });
  return tx.lead.create({ data: { personId: person.id, source: "walk_in" } });
};

const aStay = async (tx: OrgTx) =>
  tx.departureStay.create({
    data: {
      departureId: (await aDeparture(tx)).id,
      hotelName: "Isolation hotel",
      checkIn: new Date("2026-12-01"),
      checkOut: new Date("2026-12-03"),
    },
  });

const aRoom = async (tx: OrgTx) =>
  tx.departureRoom.create({ data: { stayId: (await aStay(tx)).id, label: "101", capacity: 2 } });

export const fixtures: OrgTableFixtures = {
  departure: { create: aDeparture, undeletable: true },
  departure_hold: {
    create: async (tx) =>
      tx.departureHold.create({
        data: {
          departureId: (await aDeparture(tx)).id,
          leadId: (await aLead(tx)).id,
          seats: 2,
          expiresAt: new Date("2026-12-01T10:00:00Z"),
        },
      }),
    undeletable: true,
  },
  departure_waitlist: {
    create: async (tx) =>
      tx.departureWaitlist.create({
        data: { departureId: (await aDeparture(tx)).id, leadId: (await aLead(tx)).id, seats: 2 },
      }),
  },
  departure_stay: { create: aStay },
  departure_room: { create: aRoom },
  departure_room_assignment: {
    create: async (tx) => {
      const room = await aRoom(tx);
      const lead = await aLead(tx);
      const quote = await tx.quote.create({ data: { leadId: lead.id, title: "Isolation quote" } });
      const booking = await tx.booking.create({
        data: {
          quoteId: quote.id,
          leadId: lead.id,
          number: `BK-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        },
      });
      const traveller = await tx.bookingTraveller.create({ data: { bookingId: booking.id, position: 0 } });
      return tx.departureRoomAssignment.create({
        data: { stayId: room.stayId, roomId: room.id, travellerId: traveller.id },
      });
    },
  },
  departure_settings: { create: (tx) => tx.departureSettings.create({ data: {} }), undeletable: true },
};
