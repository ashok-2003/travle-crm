// A booking the AI took, confirmed by a person (release 6 meets the AI's bookings): the customer said yes in a chat and sent
// proof of payment, and the agency confirms it. That makes the real thing, through release 6's own functions: a quote for what
// was agreed, accepted; the booking made from it and confirmed (its payments due, its reminders, its task closed); and, when
// there is an amount, the customer's payment claim carrying their proof messages, checked and recorded as a payment, which is
// what moves the lead to Won. Nothing here moves a stage by hand, so the booking's own permissions, row lock and status
// guard apply, and a cancelled one stays cancelled.
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { createQuote, setQuoteStatus } from "../quotes/index.js";
import { confirmClaim, submitPaymentClaim } from "./claims.js";
import { confirmBooking } from "./confirm.js";
import { createBookingFromQuote } from "./create-booking.js";

export interface AiBookingFacts {
  leadId: string;
  /** What was booked, in a line. */
  summary: string;
  /** What the AI wrote as the amount, in paise; 0 when it wrote none the agency can read. */
  amountPaise: number;
  /** The customer's chat messages sent as proof of payment. */
  proofMessageIds: readonly string[];
}

/** Makes and confirms the booking, and records the payment the customer's proof stands for. Returns the booking's id. */
export async function confirmAiBooking(
  tx: OrgTx,
  access: MemberAccess,
  facts: AiBookingFacts,
  now: Date,
): Promise<string> {
  const quote = await createQuote(
    tx,
    access,
    {
      leadId: facts.leadId,
      title: facts.summary.slice(0, 120),
      startDate: null,
      adults: 1,
      children: 0,
      days: [],
      items:
        facts.amountPaise > 0
          ? [{ description: facts.summary.slice(0, 200), detail: "", quantity: 1, unitPricePaise: facts.amountPaise }]
          : [],
      inclusions: "",
      exclusions: "",
      notes: "",
      taxRateBasisPoints: 0,
      placeOfSupply: null,
    },
    { supplierStateCode: null, now },
  );
  await setQuoteStatus(tx, access, { quoteId: quote.id, status: "sent" }, now);
  await setQuoteStatus(tx, access, { quoteId: quote.id, status: "accepted" }, now);
  const bookingId = await createBookingFromQuote(
    tx,
    { organizationId: access.organizationId, quoteId: quote.id, confirmed: false },
    now,
  );
  if (bookingId === null) throw new Error("The accepted quote made no booking");
  await confirmBooking(tx, access, { bookingId }, now);
  if (facts.amountPaise > 0) {
    const claimId = await submitPaymentClaim(
      tx,
      {
        organizationId: access.organizationId,
        quoteId: quote.id,
        claim: {
          installmentId: null,
          amountPaise: facts.amountPaise,
          reference: facts.proofMessageIds.length > 0 ? "Proof sent on WhatsApp" : "Confirmed by the agency",
          screenshotAttachmentId: null,
        },
        fromAi: { proofMessageIds: facts.proofMessageIds },
      },
      now,
    );
    await confirmClaim(tx, access, { claimId }, now);
  }
  return bookingId;
}
