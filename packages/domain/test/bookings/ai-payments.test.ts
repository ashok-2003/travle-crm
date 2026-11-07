// Confirming or refusing the payment behind an AI booking's proof: the payment lands on the booking's quote (made when the
// lead has none), once whatever the taps, and the lead is won; refusing sends the booking back to waiting with its proofs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { takeBooking } from "../../src/ai/booking.js";
import { createBookingFromQuote, getBooking } from "../../src/bookings/index.js";
import { confirmAiPayment, refuseAiPayment, tripPaidOnConfirm } from "../../src/bookings/ai-payments.js";
import { recordPayment, setQuoteStatus } from "../../src/quotes/index.js";
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
    // The booking's quote is kept on the AI booking too.
    const booking = await world.inOrg((tx) => tx.booking.findUniqueOrThrow({ where: { id: seen.ai.bookingId ?? "" } }));
    expect(seen.ai.quoteId).toBe(booking.quoteId);
    expect(seen.ai.quoteId).toBe(result.quoteId);
  });

  it("confirming twice records one payment", async () => {
    const { aiBookingId } = await aWaiting();
    const first = await confirm(aiBookingId);
    const second = await confirm(aiBookingId);
    expect(second).toEqual(first);
    const count = await world.inOrg((tx) => tx.quotePayment.count({ where: { quoteId: first.quoteId } }));
    expect(count).toBe(1);
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

  /** A quote a person made for the lead, sent unless told otherwise. */
  const aRealQuote = (leadId: string, totalPaise: number) =>
    world.inOrg(async (tx) => {
      const row = await tx.quote.create({
        data: {
          leadId,
          title: "Manali 5N, priced",
          status: "sent",
          sentAt: now,
          subtotalPaise: BigInt(totalPaise),
          totalPaise: BigInt(totalPaise),
        },
        select: { id: true },
      });
      return row.id;
    });
  const linkedBooking = async (aiBookingId: string) =>
    (await world.inOrg((tx) => tx.aiBooking.findUniqueOrThrow({ where: { id: aiBookingId } }))).bookingId ?? "";

  it("confirm, then accept a real quote: the booking still shows the advance paid", async () => {
    const { leadId, aiBookingId } = await aWaiting();
    const standIn = await confirm(aiBookingId);
    const bookingId = await linkedBooking(aiBookingId);
    const realId = await aRealQuote(leadId, 5_000_000);
    await world.inOrg((tx) => setQuoteStatus(tx, world.manager, { quoteId: realId, status: "accepted" }, now));
    await world.inOrg((tx) =>
      createBookingFromQuote(tx, { organizationId: world.organizationId, quoteId: realId, confirmed: false }, now),
    );
    const booking = await world.inOrg((tx) => getBooking(tx, world.manager, bookingId));
    expect(booking).toMatchObject({ quoteId: realId, paidPaise: 1_000_000, balancePaise: 4_000_000 });
    const seen = await world.inOrg(async (tx) => ({
      left: await tx.quotePayment.count({ where: { quoteId: standIn.quoteId } }),
      moved: await tx.auditEntry.findMany({ where: { entityId: realId, action: "quote.payments-moved" } }),
    }));
    expect(seen.left).toBe(0);
    expect(seen.moved).toHaveLength(1);
    expect(seen.moved[0]?.after).toMatchObject({ quoteId: realId, payments: [{ amountPaise: 1_000_000 }] });
  });

  it("a lead's sent quote is never guessed: the money goes on a stand-in, and the customer hears the AI's trip", async () => {
    const { leadId, aiBookingId } = await aWaiting();
    // An older proposal the customer never took: paying the AI booking must not accept it, nor name its trip.
    const sentId = await aRealQuote(leadId, 5_000_000);
    const row = await world.inOrg((tx) => tx.aiBooking.findUniqueOrThrow({ where: { id: aiBookingId } }));
    expect(await world.inOrg((tx) => tripPaidOnConfirm(tx, row))).toBe("Manali 5N for 4");
    const result = await confirm(aiBookingId);
    expect(result.quoteId).not.toBe(sentId);
    const seen = await world.inOrg(async (tx) => ({
      sent: await tx.quote.findUniqueOrThrow({ where: { id: sentId }, select: { status: true } }),
      bookings: await tx.booking.findMany({ where: { leadId }, select: { quoteId: true, quotePlaceholder: true } }),
    }));
    expect(seen.sent.status).toBe("sent");
    expect(seen.bookings).toEqual([{ quoteId: result.quoteId, quotePlaceholder: true }]);
  });

  it("accepting a quote smaller than what was paid on the placeholder is refused", async () => {
    const { leadId, aiBookingId } = await aWaiting();
    await confirm(aiBookingId);
    const smallId = await aRealQuote(leadId, 500_000);
    await expect(
      world.inOrg((tx) => setQuoteStatus(tx, world.manager, { quoteId: smallId, status: "accepted" }, now)),
    ).rejects.toMatchObject({ reason: "QUOTE_BELOW_PAID" });
    // Money recorded on it would accept it just the same.
    await expect(
      world.inOrg((tx) =>
        recordPayment(
          tx,
          world.manager,
          {
            quoteId: smallId,
            amountPaise: 1_000,
            receivedOn: "2026-10-30",
            method: "upi",
            reference: "",
            requestId: crypto.randomUUID(),
          },
          now,
        ),
      ),
    ).rejects.toMatchObject({ reason: "QUOTE_BELOW_PAID" });
    // Accepted all the same (a race the check missed): the booking is not moved onto it, and the money stays put.
    await world.inOrg((tx) =>
      tx.quote.update({ where: { id: smallId }, data: { status: "accepted", acceptedAt: now } }),
    );
    await expect(
      world.inOrg((tx) =>
        createBookingFromQuote(tx, { organizationId: world.organizationId, quoteId: smallId, confirmed: false }, now),
      ),
    ).rejects.toMatchObject({ reason: "QUOTE_BELOW_PAID" });
  });

  it("the stand-in quote's total is what the person confirmed, never the amount the AI wrote", async () => {
    // The AI's own figure (an invented ₹24,999) must not become the trip's total, nor a balance to chase.
    const { aiBookingId } = await aWaiting("₹24,999");
    const result = await confirm(aiBookingId, 400_000);
    const quote = await world.inOrg((tx) => tx.quote.findUniqueOrThrow({ where: { id: result.quoteId } }));
    expect(quote.totalPaise).toBe(400_000n);
  });

  it("an AI amount below what the person entered makes the stand-in quote's total the entered amount", async () => {
    const { aiBookingId } = await aWaiting("₹4,000");
    const result = await confirm(aiBookingId, 1_600_000);
    const quote = await world.inOrg((tx) => tx.quote.findUniqueOrThrow({ where: { id: result.quoteId } }));
    expect(quote.totalPaise).toBe(1_600_000n);
    expect(await world.inOrg((tx) => tx.quotePayment.count({ where: { quoteId: result.quoteId } }))).toBe(1);
  });

  it("a second AI booking paid on the stand-in quote raises its total instead of refusing", async () => {
    const { leadId, aiBookingId } = await aWaiting("₹4,000");
    const first = await confirm(aiBookingId, 400_000);
    const secondId = await world.inOrg(async (tx) => {
      const id = await takeBooking(tx, {
        organizationId: world.organizationId,
        conversationId: crypto.randomUUID(),
        leadId,
        booking: {
          confirmed: true,
          summary: "Balance",
          package: "",
          dates: "",
          travellers: "",
          pickup: "",
          amount: "₹2,000",
        },
        recipients: [],
        now,
      });
      return id ?? "";
    });
    const second = await confirm(secondId, 1_000_000);
    expect(second.quoteId).toBe(first.quoteId);
    const quote = await world.inOrg((tx) => tx.quote.findUniqueOrThrow({ where: { id: first.quoteId } }));
    expect(quote.totalPaise).toBe(1_400_000n);
  });

  it("a booking still waiting for a proof can't be refused", async () => {
    const { aiBookingId } = await aWaiting();
    await expect(
      world.inOrg((tx) => refuseAiPayment(tx, world.accounts, { bookingId: aiBookingId, reason: "other" }, now)),
    ).rejects.toMatchObject({ reason: "AI_BOOKING_NOT_OPEN" });
  });
});
