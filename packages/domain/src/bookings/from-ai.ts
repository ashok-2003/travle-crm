// A booking the AI took, confirmed by a person (release 6 meets the AI's bookings): the confirmation, which still wins the lead
// by its own rules, also makes (or finds) the release 6 booking, confirmed. When the lead has an accepted quote the booking is
// that quote's (made now if it has none); otherwise the booking stands on a quote made from what the chat agreed (its trip,
// travellers and amount when written, the dates, pickup and package in its notes), which a real quote accepted later replaces.
// The customer's proof messages are kept on the booking. Confirming again finds the same booking.
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { agreedQuote } from "../quotes/index.js";
import { confirmBookingAs } from "./confirm.js";
import { createBookingFromQuote } from "./create-booking.js";

export interface AiBookingFacts {
  leadId: string;
  /** What was booked, in a line. */
  summary: string;
  details: { package: string; dates: string; travellers: string; pickup: string; amountPaise: number };
  /** The customer's chat messages sent as proof of payment. */
  proofMessageIds: readonly string[];
  /** The booking an earlier confirmation made, if any. */
  linkedBookingId: string | null;
}

/** How many travellers the AI wrote down: the first whole number in its words, one if there is none. */
export const travellersOf = (text: string): number => {
  const found = /\d+/.exec(text);
  return Math.min(500, Math.max(1, found === null ? 1 : Number(found[0])));
};

const notesOf = (facts: AiBookingFacts) =>
  [
    "Taken in a WhatsApp chat by the AI.",
    facts.details.package === "" ? "" : `Package: ${facts.details.package}`,
    facts.details.dates === "" ? "" : `Dates: ${facts.details.dates}`,
    facts.details.travellers === "" ? "" : `Travellers: ${facts.details.travellers}`,
    facts.details.pickup === "" ? "" : `Pickup: ${facts.details.pickup}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

/** The booking for an AI request being confirmed: the one already linked, the lead's accepted quote's, or a new one. */
export async function linkAiBooking(tx: OrgTx, actor: Actor, facts: AiBookingFacts, now: Date): Promise<string> {
  let bookingId = facts.linkedBookingId;
  if (bookingId === null) {
    const accepted = await tx.quote.findFirst({
      where: { leadId: facts.leadId, status: "accepted" },
      orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    const quoteId =
      accepted?.id ??
      (await agreedQuote(
        tx,
        actor,
        {
          leadId: facts.leadId,
          title: facts.summary,
          travellers: travellersOf(facts.details.travellers),
          notes: notesOf(facts),
          amountPaise: facts.details.amountPaise,
        },
        now,
      ));
    bookingId = await createBookingFromQuote(
      tx,
      { organizationId: actor.organizationId, quoteId, confirmed: false },
      now,
    );
    if (bookingId === null) throw new Error("The accepted quote made no booking");
    if (accepted === null) await tx.booking.update({ where: { id: bookingId }, data: { quotePlaceholder: true } });
  }
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { status: true, proofMessageIds: true },
  });
  if (booking.status === "requested") await confirmBookingAs(tx, actor, bookingId, now);
  await tx.booking.update({
    where: { id: bookingId },
    data: { proofMessageIds: [...new Set([...booking.proofMessageIds, ...facts.proofMessageIds])] },
  });
  return bookingId;
}
