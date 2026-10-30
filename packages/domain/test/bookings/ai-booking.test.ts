// A booking the AI took, confirmed by a person (release 6 meets the AI's bookings): the confirmation makes a quote, a confirmed
// booking and the customer's payment claim with their proof, checked and recorded, which wins the lead; it never moves the
// lead by hand, a cancelled booking stays cancelled, a confirmed one is changed on its booking, and a lead keeps one open.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setBookingStatus, takeBooking } from "../../src/ai/booking.js";
import { getBooking } from "../../src/bookings/index.js";
import { aLead } from "../crm/support/records.js";
import { openWorld, type World } from "./support.js";

const now = new Date("2026-10-30T06:30:00Z");

describe("a booking the AI took", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("AI bookings");
  });
  afterAll(async () => {
    await world.close();
  });

  const facts = (amount: string) => ({
    summary: "Manali 5N for 4",
    package: "Manali 5N",
    dates: "12 Dec",
    travellers: "4",
    pickup: "Delhi",
    amount,
  });

  async function aTaken(amount = "₹40,000") {
    return world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" });
      const conversation = await tx.whatsappConversation.findFirst({ select: { id: true } });
      const id = await takeBooking(tx, {
        organizationId: world.organizationId,
        conversationId: conversation?.id ?? crypto.randomUUID(),
        leadId: lead.id,
        booking: facts(amount),
        recipients: [],
        now,
      });
      return { leadId: lead.id, aiBookingId: id ?? "" };
    });
  }

  it("is confirmed into a booking, a quote and a recorded payment that wins the lead, with the proof kept", async () => {
    const { leadId, aiBookingId } = await aTaken();
    const proof = crypto.randomUUID();
    await world.inOrg((tx) =>
      tx.aiBooking.update({ where: { id: aiBookingId }, data: { status: "proof_received", proofMessageIds: [proof] } }),
    );
    await world.inOrg((tx) =>
      setBookingStatus(tx, world.manager, { bookingId: aiBookingId, status: "confirmed" }, now),
    );
    const row = await world.inOrg((tx) => tx.aiBooking.findUniqueOrThrow({ where: { id: aiBookingId } }));
    expect(row).toMatchObject({ status: "confirmed", decidedBy: world.manager.userId });
    const booking = await world.inOrg((tx) => getBooking(tx, world.manager, row.bookingId ?? ""));
    expect(booking).toMatchObject({ status: "confirmed", totalPaise: 4_000_000, paidPaise: 4_000_000, leadId });
    const claim = await world.inOrg((tx) => tx.paymentClaim.findFirstOrThrow({ where: { bookingId: booking.id } }));
    expect(claim).toMatchObject({ status: "confirmed", proofMessageIds: [proof] });
    expect((await world.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: leadId } }))).stage).toBe("won");
    // A second tap changes nothing.
    await world.inOrg((tx) =>
      setBookingStatus(tx, world.manager, { bookingId: aiBookingId, status: "confirmed" }, now),
    );
    expect(await world.inOrg((tx) => tx.booking.count({ where: { leadId } }))).toBe(1);
  });

  it("leaves the lead at Booking requested when no amount can be read, for staff to record the payment", async () => {
    const { leadId, aiBookingId } = await aTaken("about forty thousand");
    await world.inOrg((tx) =>
      setBookingStatus(tx, world.manager, { bookingId: aiBookingId, status: "confirmed" }, now),
    );
    expect((await world.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: leadId } }))).stage).toBe(
      "booking_requested",
    );
    expect(await world.inOrg((tx) => tx.booking.count({ where: { leadId, status: "confirmed" } }))).toBe(1);
  });

  it("never re-confirms a cancelled one, and changes a confirmed one only on its booking", async () => {
    const off = await aTaken();
    await world.inOrg((tx) =>
      setBookingStatus(tx, world.manager, { bookingId: off.aiBookingId, status: "cancelled" }, now),
    );
    await expect(
      world.inOrg((tx) =>
        setBookingStatus(tx, world.manager, { bookingId: off.aiBookingId, status: "confirmed" }, now),
      ),
    ).rejects.toMatchObject({ reason: "AI_BOOKING_CANCELLED" });
    expect(await world.inOrg((tx) => tx.booking.count({ where: { leadId: off.leadId } }))).toBe(0);
    const on = await aTaken();
    await world.inOrg((tx) =>
      setBookingStatus(tx, world.manager, { bookingId: on.aiBookingId, status: "confirmed" }, now),
    );
    await expect(
      world.inOrg((tx) => setBookingStatus(tx, world.manager, { bookingId: on.aiBookingId, status: "cancelled" }, now)),
    ).rejects.toMatchObject({ reason: "AI_BOOKING_CONFIRMED" });
  });

  it("keeps one open booking to a lead, whatever the second yes does", async () => {
    const { leadId, aiBookingId } = await aTaken();
    const again = await world.inOrg(async (tx) =>
      takeBooking(tx, {
        organizationId: world.organizationId,
        conversationId: crypto.randomUUID(),
        leadId,
        booking: facts("₹40,000"),
        recipients: [],
        now,
      }),
    );
    expect(again).toBe(aiBookingId);
    expect(await world.inOrg((tx) => tx.aiBooking.count({ where: { leadId } }))).toBe(1);
  });
});
