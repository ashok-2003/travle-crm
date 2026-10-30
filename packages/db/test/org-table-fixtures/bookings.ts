// Isolation fixtures for the bookings module: a booking with its stays, travellers and their ID numbers, payment claims,
// refunds, reminders, feedback, the cancellation policy and the settings. A booking and a traveller are soft-deleted, and
// the claims, refunds, feedback, identities and settings are kept, so the runtime role deletes none of them; a stay, a
// reminder and a policy step are plain data it may delete.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const aBooking = async (tx: OrgTx) => {
  const person = await tx.person.create({
    data: { name: "Isolation person", email: `booking-${randomUUID()}@example.test` },
  });
  const lead = await tx.lead.create({ data: { personId: person.id, source: "walk_in" } });
  const quote = await tx.quote.create({ data: { leadId: lead.id, title: "Isolation quote" } });
  return tx.booking.create({
    data: { quoteId: quote.id, leadId: lead.id, number: `BK-2026-${String(Math.floor(Math.random() * 9000) + 1000)}` },
  });
};

const aTraveller = async (tx: OrgTx) =>
  tx.bookingTraveller.create({
    data: { bookingId: (await aBooking(tx)).id, position: 0, name: "Isolation traveller" },
  });

export const fixtures: OrgTableFixtures = {
  booking: { create: aBooking, undeletable: true },
  booking_stay: {
    create: async (tx) =>
      tx.bookingStay.create({
        data: {
          bookingId: (await aBooking(tx)).id,
          name: "Isolation hotel",
          checkIn: new Date("2026-12-01"),
          checkOut: new Date("2026-12-03"),
        },
      }),
  },
  booking_traveller: { create: aTraveller, undeletable: true },
  booking_traveller_identity: {
    create: async (tx) =>
      tx.bookingTravellerIdentity.create({
        data: { travellerId: (await aTraveller(tx)).id, kind: "passport", number: "X1234567" },
      }),
    undeletable: true,
  },
  payment_claim: {
    create: async (tx) =>
      tx.paymentClaim.create({ data: { bookingId: (await aBooking(tx)).id, amountPaise: 100_00n, reference: "UTR1" } }),
    undeletable: true,
  },
  booking_refund: {
    create: async (tx) =>
      tx.bookingRefund.create({ data: { bookingId: (await aBooking(tx)).id, amountPaise: 100_00n } }),
    undeletable: true,
  },
  booking_reminder: {
    create: async (tx) =>
      tx.bookingReminder.create({
        data: { bookingId: (await aBooking(tx)).id, kind: "details", key: "details:-:10", sendAt: new Date() },
      }),
  },
  booking_feedback: {
    create: async (tx) => tx.bookingFeedback.create({ data: { bookingId: (await aBooking(tx)).id, overall: 5 } }),
    undeletable: true,
  },
  cancellation_policy_rule: {
    create: (tx) => tx.cancellationPolicyRule.create({ data: { daysBeforeMin: 0, chargeBasisPoints: 10000 } }),
  },
  booking_settings: { create: (tx) => tx.bookingSettings.create({ data: {} }), undeletable: true },
};
