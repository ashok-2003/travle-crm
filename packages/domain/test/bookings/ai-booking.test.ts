// A booking the AI took, confirmed by a person (release 6 meets the AI's bookings): the confirmation, which still wins the
// lead as before, also makes and links a confirmed release 6 booking with the proof kept; confirming again reuses it, a lead
// with an accepted quote links to that quote's booking, and a real quote accepted later takes the chat's place, not a second.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setBookingStatus, takeBooking } from "../../src/ai/booking.js";
import { createBookingFromQuote } from "../../src/bookings/index.js";
import { agreedQuote } from "../../src/quotes/index.js";
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
    confirmed: true,
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

  const confirm = (id: string) =>
    world.inOrg((tx) => setBookingStatus(tx, world.manager, { bookingId: id, status: "confirmed" }, now));
  const linked = async (id: string) =>
    (await world.inOrg((tx) => tx.aiBooking.findUniqueOrThrow({ where: { id } }))).bookingId ?? "";

  it("makes and links a confirmed booking, keeps the proof, and still wins the lead", async () => {
    const { leadId, aiBookingId } = await aTaken();
    const proof = crypto.randomUUID();
    await world.inOrg((tx) =>
      tx.aiBooking.update({ where: { id: aiBookingId }, data: { status: "proof_received", proofMessageIds: [proof] } }),
    );
    await confirm(aiBookingId);
    const bookingId = await linked(aiBookingId);
    const booking = await world.inOrg((tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId } }));
    expect(booking).toMatchObject({ status: "confirmed", leadId, quotePlaceholder: true, proofMessageIds: [proof] });
    const quote = await world.inOrg((tx) => tx.quote.findUniqueOrThrow({ where: { id: booking.quoteId } }));
    expect(quote).toMatchObject({ status: "accepted", adults: 4, totalPaise: 4_000_000n });
    expect((await world.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: leadId } }))).stage).toBe("won");
  });

  it("reuses the linked booking when confirmed again", async () => {
    const { leadId, aiBookingId } = await aTaken();
    await confirm(aiBookingId);
    const first = await linked(aiBookingId);
    await confirm(aiBookingId);
    expect(await linked(aiBookingId)).toBe(first);
    expect(await world.inOrg((tx) => tx.booking.count({ where: { leadId } }))).toBe(1);
  });

  it("links to the booking of the lead's accepted quote", async () => {
    const { leadId, aiBookingId } = await aTaken();
    const quoteId = await world.inOrg(async (tx) => {
      const id = await agreedQuote(
        tx,
        world.manager,
        { leadId, title: "Real quote", travellers: 4, notes: "", amountPaise: 5_000_000 },
        now,
      );
      await createBookingFromQuote(tx, { organizationId: world.organizationId, quoteId: id, confirmed: false }, now);
      return id;
    });
    await confirm(aiBookingId);
    const bookingId = await linked(aiBookingId);
    const row = await world.inOrg((tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId } }));
    expect(row).toMatchObject({ quoteId, quotePlaceholder: false, status: "confirmed" });
    expect(await world.inOrg((tx) => tx.booking.count({ where: { leadId } }))).toBe(1);
  });

  it("is taken over by a real quote accepted later, never doubled", async () => {
    const { leadId, aiBookingId } = await aTaken();
    await confirm(aiBookingId);
    const bookingId = await linked(aiBookingId);
    const quoteId = await world.inOrg((tx) =>
      agreedQuote(
        tx,
        world.manager,
        { leadId, title: "Real quote", travellers: 4, notes: "", amountPaise: 5_000_000 },
        now,
      ),
    );
    const result = await world.inOrg((tx) =>
      createBookingFromQuote(tx, { organizationId: world.organizationId, quoteId, confirmed: false }, now),
    );
    expect(result).toBe(bookingId);
    expect(await world.inOrg((tx) => tx.booking.count({ where: { leadId } }))).toBe(1);
    expect(await world.inOrg((tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId } }))).toMatchObject({
      quoteId,
      quotePlaceholder: false,
    });
  });
});
