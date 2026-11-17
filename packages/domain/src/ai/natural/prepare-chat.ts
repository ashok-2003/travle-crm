// What the natural turn reads about the chat beyond its lines (spec 3.4, 4.4): the booking still ahead of the customer,
// so the model offers no second one and says a payment came only when a person recorded it, and the ad the chat came
// from, which the turn block names.
import type { OrgTx } from "@travel-crm/db";
import type { CalendarDate } from "../../kernel/index.js";
import type { NaturalContextInput } from "./context/build.js";

/** A booking ahead of the customer: the chat's own AI booking, or one on any of their leads. */
export interface BookingAhead {
  id: string;
  /** The chat's own AI booking waits for its advance, which `resend_payment` asks for again. */
  awaitingPayment: boolean;
  /** A person recorded the payment. */
  paymentConfirmed: boolean;
  /** A person confirmed the booking. */
  confirmed: boolean;
}

const OPEN_STATUSES = ["awaiting_payment", "proof_received"];
const newestFirst = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/**
 * The chat's own AI booking still open, else a booking still ahead on any of the person's leads, as lite's has_booking
 * reads it: a requested or confirmed booking, or an AI booking a person confirmed whose departure is today or later. A
 * trip that is over makes them a returning customer, with nothing ahead. An open AI booking an earlier agent took keeps
 * no amount, so it can't be asked for again: it is a booking ahead, the team's.
 */
export async function bookingAheadOf(
  tx: OrgTx,
  chat: { id: string; personId: string | null },
  today: CalendarDate,
): Promise<BookingAhead | null> {
  const open = await tx.aiBooking.findFirst({
    where: { conversationId: chat.id, status: { in: OPEN_STATUSES } },
    orderBy: newestFirst,
    select: { id: true, status: true, expectedPaise: true },
  });
  if (open !== null) {
    const awaitingPayment = open.status === "awaiting_payment" && open.expectedPaise !== null;
    return { id: open.id, awaitingPayment, paymentConfirmed: false, confirmed: false };
  }
  if (chat.personId === null) return null;
  const leads = await tx.lead.findMany({ where: { personId: chat.personId }, select: { id: true } });
  const leadIds = leads.map((lead) => lead.id);
  if (leadIds.length === 0) return null;
  const paid = await tx.aiBooking.findFirst({
    where: {
      leadId: { in: leadIds },
      status: "confirmed",
      quote: { departure: { startDate: { gte: new Date(`${today}T00:00:00Z`) } } },
    },
    orderBy: newestFirst,
    select: { id: true },
  });
  if (paid !== null) return { id: paid.id, awaitingPayment: false, paymentConfirmed: true, confirmed: true };
  const booking = await tx.booking.findFirst({
    where: { leadId: { in: leadIds }, status: { in: ["requested", "confirmed"] } },
    orderBy: newestFirst,
    select: { id: true, status: true, quoteId: true },
  });
  if (booking === null) return null;
  const payment = await tx.quotePayment.findFirst({
    where: { quoteId: booking.quoteId, voidedAt: null },
    select: { id: true },
  });
  return {
    id: booking.id,
    awaitingPayment: false,
    paymentConfirmed: payment !== null,
    confirmed: booking.status === "confirmed",
  };
}

/** Where the ad's link points, as the customer saw it: Meta's links name Instagram or Facebook. */
function adSourceOf(sourceUrl: string | null): string {
  const host = URL.parse(sourceUrl ?? "")?.hostname ?? "";
  if (host.includes("instagram")) return "Instagram ad";
  return host.includes("facebook") || host === "fb.me" || host.endsWith(".fb.me") ? "Facebook ad" : "an ad";
}

/** The ad the chat last came from, with its trip when that is on sale (`adPackageId`); null when no ad brought it. */
export async function cameFromOf(
  tx: OrgTx,
  conversationId: string,
  adPackageId: string | null,
): Promise<NaturalContextInput["cameFrom"]> {
  const chat = await tx.whatsappConversation.findFirst({
    where: { id: conversationId },
    select: { lastAd: { select: { sourceUrl: true } } },
  });
  const ad = chat?.lastAd ?? null;
  return ad === null ? null : { source: adSourceOf(ad.sourceUrl), packageId: adPackageId };
}
