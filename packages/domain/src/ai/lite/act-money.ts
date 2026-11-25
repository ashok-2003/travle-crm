// Taking a lapsed hold again before payment is asked: a booking's seats held now, its quote unchanged, and somewhere to
// pay read now. Any refusal throws: nothing is held, booked or sent.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import { DomainError, systemActor } from "../../kernel/index.js";
import { agencyPaymentDetailsOf, paymentDetailsReady, type AgencyPaymentDetails } from "../../profile/index.js";
import type { ActGateInput } from "./act-gates.js";

const refuse = (message: string) => new DomainError("CONFLICT", "AI_ACTION_REFUSED", message);

/** Somewhere to pay, read now: the owner may have cleared it since the price was told. */
async function paymentDetails(tx: OrgTx, organizationId: string): Promise<AgencyPaymentDetails> {
  const details = await agencyPaymentDetailsOf(tx, organizationId);
  if (!paymentDetailsReady(details)) {
    throw new DomainError("CONFLICT", "PAYMENT_DETAILS_MISSING", "The agency has no payment details to send");
  }
  return details;
}

/** A booking waiting for its payment whose hold lapsed: what the agent's own booking takes again. */
export interface LapsedBooking {
  packageId: string;
  departureId: string;
  /** The party its quote held seats for. */
  adults: number;
  children: number;
  /** The total the customer was told, and the amount the booking asked. */
  totalPaise: number;
  expectedPaise: number;
}

/** The payment details to send again: the booking's amount, its quote's total and where to pay. */
export interface PaidAgain {
  /** Null: the booking still waiting is the one; its seats are still held. */
  bookingId: string | null;
  expectedPaise: number;
  totalPaise: number;
  payment: AgencyPaymentDetails;
}

/**
 * The chat's booking still waiting for its payment: the amount it asks and its quote's total, as booked, while the
 * lead's hold of the party's seats is live. Once it has lapsed the old one is cancelled and `rebook`, the agent's own
 * booking (its rooms are the agent's to say: the booking keeps none), takes the seats again at the total that booking
 * was told, in a booking of this turn's; seats gone or a changed total throw, as a booking does.
 */
export async function payAgainBooking<Taken>(
  tx: OrgTx,
  input: Pick<ActGateInput, "organizationId" | "conversationId" | "now">,
  rebook: (lapsed: LapsedBooking) => Promise<Taken>,
): Promise<PaidAgain | Taken> {
  const { conversationId, now } = input;
  const open = await tx.aiBooking.findFirst({
    where: { conversationId, status: "awaiting_payment" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      leadId: true,
      expectedPaise: true,
      quote: { select: { totalPaise: true, templateId: true, departureId: true, adults: true, children: true } },
    },
  });
  const quote = open?.quote ?? null;
  if (open?.expectedPaise == null || quote?.templateId == null || quote.departureId == null) {
    throw refuse("No booking is waiting for its payment");
  }
  // The party the booking's own quote holds seats for: the facts may say fewer now, and a hold that short is no hold.
  const party = Math.max(1, quote.adults + quote.children);
  const held = await tx.departureHold.findFirst({
    where: {
      leadId: open.leadId,
      departureId: quote.departureId,
      seats: { gte: party },
      status: "active",
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  const amounts = { expectedPaise: Number(open.expectedPaise), totalPaise: Number(quote.totalPaise) };
  if (held === null) {
    // One booking waits for payment at a time: the lapsed one goes. If the new one is refused, this rolls back with it.
    const actor = systemActor(input.organizationId);
    await tx.aiBooking.update({ where: { id: open.id }, data: { status: "cancelled", decidedAt: now } });
    await recordAudit(tx, actor, {
      action: "ai.booking-decided",
      entityType: "ai_booking",
      entityId: open.id,
      after: { status: "cancelled" },
    });
    const { templateId: packageId, departureId, adults, children } = quote;
    return rebook({ packageId, departureId, adults, children, ...amounts });
  }
  return { bookingId: null, ...amounts, payment: await paymentDetails(tx, input.organizationId) };
}
