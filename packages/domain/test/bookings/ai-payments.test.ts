// Confirming or refusing the payment behind an AI booking's proof: the payment lands on the booking's quote (made when the
// lead has none), once whatever the taps, and the lead is won; refusing sends the booking back to waiting with its proofs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { takeBooking } from "../../src/ai/booking.js";
import { createBookingFromQuote } from "../../src/bookings/index.js";
import { confirmAiPayment, expectedAdvanceOf, refuseAiPayment } from "../../src/bookings/ai-payments.js";
import { aLead } from "../crm/support/records.js";
import { aQuote, openWorld, type World } from "./support.js";

const now = new Date("2026-10-30T06:30:00Z");

describe("the payment behind an AI booking", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("AI payments");
  });
  afterAll(async () => {
    await world.close();
  });

  async function aWaiting(amount = "₹40,000") {
    return world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" });
      const id = await takeBooking(tx, {
        organizationId: world.organizationId,
        conversationId: crypto.randomUUID(),
        leadId: lead.id,
        booking: {
          confirmed: true,
          summary: "Manali 5N for 4",
          package: "Manali 5N",
          dates: "12 Dec",
          travellers: "4",
          pickup: "Delhi",
          amount,
        },
        recipients: [],
        now,
      });
      return { leadId: lead.id, aiBookingId: id ?? "" };
    });
  }

  const confirm = (bookingId: string, amountPaise = 1_000_000) =>
    world.inOrg((tx) => confirmAiPayment(tx, world.accounts, { bookingId, amountPaise, reference: "UPI123" }, now));

  it("confirming a proof with no quote yet makes the quote and booking, records the payment and wins the lead", async () => {
    const { leadId, aiBookingId } = await aWaiting();
    const result = await confirm(aiBookingId);
    expect(result.leadId).toBe(leadId);
    const seen = await world.inOrg(async (tx) => ({
      payments: await tx.quotePayment.findMany({ where: { quoteId: result.quoteId } }),
      lead: await tx.lead.findUniqueOrThrow({ where: { id: leadId }, select: { stage: true } }),
      ai: await tx.aiBooking.findUniqueOrThrow({ where: { id: aiBookingId } }),
    }));
    expect(seen.payments).toHaveLength(1);
    expect(Number(seen.payments[0]?.amountPaise)).toBe(1_000_000);
    expect(seen.payments[0]?.method).toBe("upi");
    expect(seen.lead.stage).toBe("won");
    expect(seen.ai.status).toBe("confirmed");
    expect(seen.ai.bookingId).not.toBeNull();
  });

  it("confirming twice records one payment", async () => {
    const { aiBookingId } = await aWaiting();
    const first = await confirm(aiBookingId);
    const second = await confirm(aiBookingId);
    expect(second).toEqual(first);
    const count = await world.inOrg((tx) => tx.quotePayment.count({ where: { quoteId: first.quoteId } }));
    expect(count).toBe(1);
  });

  it("the expected advance is the plan 4 amount when set, else the booking's own amount", () => {
    expect(expectedAdvanceOf({ expectedPaise: 500_000n, details: { amount: "₹40,000" } })).toBe(500_000);
    expect(expectedAdvanceOf({ expectedPaise: null, details: { amount: "₹40,000" } })).toBe(4_000_000);
    expect(expectedAdvanceOf({ expectedPaise: null, details: { amount: "soon" } })).toBeNull();
  });

  it("refusing sends the booking back to waiting, with its proofs", async () => {
    const { aiBookingId } = await aWaiting();
    const proof = crypto.randomUUID();
    await world.inOrg((tx) =>
      tx.aiBooking.update({ where: { id: aiBookingId }, data: { status: "proof_received", proofMessageIds: [proof] } }),
    );
    await world.inOrg((tx) =>
      refuseAiPayment(tx, world.accounts, { bookingId: aiBookingId, reason: "not_found" }, now),
    );
    const row = await world.inOrg((tx) => tx.aiBooking.findUniqueOrThrow({ where: { id: aiBookingId } }));
    expect(row.status).toBe("awaiting_payment");
    expect(row.proofMessageIds).toEqual([proof]);
    const audits = await world.inOrg((tx) =>
      tx.auditEntry.count({ where: { entityId: aiBookingId, action: "ai.payment-refused" } }),
    );
    expect(audits).toBe(1);
  });

  it("another agency's booking is not found", async () => {
    const other = await openWorld("Other agency");
    try {
      const { aiBookingId } = await aWaiting();
      await expect(
        other.inOrg((tx) =>
          confirmAiPayment(tx, other.accounts, { bookingId: aiBookingId, amountPaise: 1000, reference: "" }, now),
        ),
      ).rejects.toMatchObject({ reason: "NOT_FOUND" });
    } finally {
      await other.close();
    }
  });

  async function aChosenQuote(status: "sent" | "accepted") {
    return world.inOrg(async (tx) => {
      const { lead, quote } = await aQuote(tx, { ownerUserId: world.seller.userId, status, totalPaise: 4_000_000 });
      const ai = await tx.aiBooking.create({
        data: {
          leadId: lead.id,
          conversationId: crypto.randomUUID(),
          summary: "Spiti",
          details: { amount: "" },
          status: "proof_received",
          quoteId: quote.id,
          expectedPaise: 1_000_000n,
        },
        select: { id: true },
      });
      return { aiBookingId: ai.id, quoteId: quote.id };
    });
  }

  it.each(["sent", "accepted"] as const)(
    "a %s chosen quote is paid, with one booking linked, even after the listener",
    async (status) => {
      const { aiBookingId, quoteId } = await aChosenQuote(status);
      const result = await confirm(aiBookingId);
      expect(result.quoteId).toBe(quoteId);
      await world.inOrg((tx) =>
        createBookingFromQuote(tx, { organizationId: world.organizationId, quoteId, confirmed: true }, now),
      );
      const seen = await world.inOrg(async (tx) => ({
        bookings: await tx.booking.findMany({ where: { quoteId }, select: { id: true } }),
        payments: await tx.quotePayment.count({ where: { quoteId } }),
        ai: await tx.aiBooking.findUniqueOrThrow({ where: { id: aiBookingId } }),
      }));
      expect(seen.bookings).toHaveLength(1);
      expect(seen.payments).toBe(1);
      expect(seen.ai.bookingId).toBe(seen.bookings[0]?.id);
    },
  );

  it("more than the trip's total is refused with its own reason", async () => {
    const { aiBookingId } = await aChosenQuote("accepted");
    await expect(confirm(aiBookingId, 5_000_000)).rejects.toMatchObject({ reason: "AI_PAYMENT_OVER_TOTAL" });
  });

  it("a booking still waiting for a proof can't be refused", async () => {
    const { aiBookingId } = await aWaiting();
    await expect(
      world.inOrg((tx) => refuseAiPayment(tx, world.accounts, { bookingId: aiBookingId, reason: "other" }, now)),
    ).rejects.toMatchObject({ reason: "AI_BOOKING_NOT_OPEN" });
  });
});
