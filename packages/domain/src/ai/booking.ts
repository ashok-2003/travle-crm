// Bookings the AI agent takes (the owner, 2026-10-29): when a customer clearly says yes, the lead moves to Booking
// requested, the booking's details go on the lead (a row of its own and a note), and the lead's owner and the agency's
// managers are told by email and push. A photo or PDF the customer sends while it waits for payment is kept as their
// payment proof (the chat's own message, whose file is already stored) and the team is told to check it. A person
// confirms the payment (the lead is won) or cancels; the agent never says a payment was received.
import { aiBookingList, aiBookingStatus, type AgentAnswer, type AiBooking } from "@travel-crm/contracts/ai";
import { whatsappCustomerWroteEvent } from "@travel-crm/contracts/inbox";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import type { OrgTx } from "@travel-crm/db";
import { linkAiBooking } from "../bookings/index.js";
import { addAiLeadNote, advanceLeadStage, noticeKey } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { CUSTOMER_WROTE_EVENT } from "../inbox/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import { recordAudit } from "../audit/index.js";
import { DomainError, systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";

export const AI_BOOKING_KIND = "ai.booking";
export const AI_PAYMENT_PROOF_KIND = "ai.payment-proof";
const OPEN_STATUSES = ["awaiting_payment", "proof_received"];
/** What a customer sends as payment proof: a screenshot or a PDF receipt. */
const PROOF_KINDS = ["image", "document"];

/** Who hears about a booking: the lead's owner and the agency's managers. */
export type BookingRecipients = (organizationId: string) => Promise<string[]>;

type BookingFacts = AgentAnswer["booking"];

const detailsOf = (booking: BookingFacts) => ({
  package: booking.package.trim(),
  dates: booking.dates.trim(),
  travellers: booking.travellers.trim(),
  pickup: booking.pickup.trim(),
  amount: booking.amount.trim(),
});

const noteOf = (summary: string, details: ReturnType<typeof detailsOf>) =>
  [
    `Booking taken by the AI: ${summary}`,
    details.package === "" ? null : `Package: ${details.package}`,
    details.dates === "" ? null : `Dates: ${details.dates}`,
    details.travellers === "" ? null : `Travellers: ${details.travellers}`,
    details.pickup === "" ? null : `Pickup: ${details.pickup}`,
    details.amount === "" ? null : `Amount: ${details.amount}`,
    "Waiting for the payment proof.",
  ]
    .filter((line) => line !== null)
    .join("\n");

/** The lead's open booking taken by the AI, if one waits for payment. */
export const openBookingOf = (tx: OrgTx, leadId: string) =>
  tx.aiBooking.findFirst({
    where: { leadId, status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: "desc" },
    select: { id: true, summary: true, details: true },
  });

/**
 * The customer said yes: the booking is taken once a lead (a second yes fills in what the first left out), the lead moves
 * to Booking requested and the team is told. Returns the booking's id, or null for a chat with no lead.
 */
export async function takeBooking(
  tx: OrgTx,
  input: {
    organizationId: string;
    conversationId: string;
    leadId: string | null;
    booking: BookingFacts;
    recipients: readonly string[];
    now: Date;
  },
): Promise<string | null> {
  if (input.leadId === null) return null;
  const actor = systemActor(input.organizationId);
  const details = detailsOf(input.booking);
  const summary = (input.booking.summary.trim() || details.package || "A trip").slice(0, 300);
  const open = await openBookingOf(tx, input.leadId);
  if (open !== null) {
    const before = open.details as Record<string, string>;
    const merged = Object.fromEntries(
      Object.entries(details).map(([key, value]) => [key, value === "" ? (before[key] ?? "") : value]),
    );
    await tx.aiBooking.update({ where: { id: open.id }, data: { details: merged } });
    return open.id;
  }
  const row = await tx.aiBooking.create({
    data: { leadId: input.leadId, conversationId: input.conversationId, summary, details },
    select: { id: true },
  });
  await advanceLeadStage(tx, actor, { leadId: input.leadId, stage: "booking_requested" }, input.now);
  await addAiLeadNote(tx, actor, input.leadId, noteOf(summary, details));
  const lead = await tx.lead.findUnique({
    where: { id: input.leadId },
    select: { ownerUserId: true, person: { select: { name: true } } },
  });
  await notify(tx, actor, {
    recipientUserIds: [...new Set([...(lead?.ownerUserId == null ? [] : [lead.ownerUserId]), ...input.recipients])],
    sourceEventId: noticeKey(`ai-booking:${row.id}`, AI_BOOKING_KIND),
    kind: AI_BOOKING_KIND,
    title: `New booking: ${lead?.person.name ?? "a customer"} said yes`.slice(0, 120),
    body: [summary, details.dates, details.amount]
      .filter((part) => part !== "")
      .join(" · ")
      .slice(0, 300),
    link: `/leads/${input.leadId}`,
    channels: ["email", "push"],
  });
  return row.id;
}

/** A photo or PDF from a customer whose booking waits for payment is kept as their proof, and the team is told. */
export function aiPaymentProofListener(dependencies: { recipients: BookingRecipients }): EventListener {
  return defineListener({
    name: "ai.payment-proof",
    eventType: CUSTOMER_WROTE_EVENT,
    payload: whatsappCustomerWroteEvent,
    handle: async (event, context) => {
      const { conversationId, messageId } = event.payload;
      const found = await context.forOrg(async (tx) => {
        const message = await tx.whatsappMessage.findUnique({
          where: { id: messageId },
          select: { kind: true, occurredAt: true },
        });
        if (message === null || !PROOF_KINDS.includes(message.kind)) return null;
        return tx.aiBooking.findFirst({
          where: { conversationId, status: { in: OPEN_STATUSES }, createdAt: { lte: message.occurredAt } },
          orderBy: { createdAt: "desc" },
          select: { id: true, leadId: true, summary: true, proofMessageIds: true },
        });
      });
      if (found === null || found.proofMessageIds.includes(messageId)) return;
      const recipients = await dependencies.recipients(event.organizationId);
      await context.forOrg(async (tx) => {
        await tx.aiBooking.update({
          where: { id: found.id },
          data: { status: "proof_received", proofMessageIds: [...found.proofMessageIds, messageId] },
        });
        await addAiLeadNote(
          tx,
          context.actor,
          found.leadId,
          `Payment proof received on WhatsApp for: ${found.summary}. Check it and confirm the booking.`,
        );
        const lead = await tx.lead.findUnique({
          where: { id: found.leadId },
          select: { ownerUserId: true, person: { select: { name: true } } },
        });
        await notify(tx, context.actor, {
          recipientUserIds: [...new Set([...(lead?.ownerUserId == null ? [] : [lead.ownerUserId]), ...recipients])],
          sourceEventId: noticeKey(`ai-proof:${messageId}`, AI_PAYMENT_PROOF_KIND),
          kind: AI_PAYMENT_PROOF_KIND,
          title: `${lead?.person.name ?? "A customer"} sent a payment screenshot`.slice(0, 120),
          body: `${found.summary}. Check it and confirm the booking.`.slice(0, 300),
          link: `/leads/${found.leadId}`,
          channels: ["email", "push"],
        });
      });
    },
  });
}

/** The bookings the AI took on a lead, newest first, with the customer's proofs. The caller checked the lead is seen. */
export async function bookingsOfLead(tx: OrgTx, leadId: string): Promise<AiBooking[]> {
  const rows = await tx.aiBooking.findMany({ where: { leadId }, orderBy: { createdAt: "desc" }, take: 20 });
  const proofIds = rows.flatMap((row) => row.proofMessageIds);
  const proofs =
    proofIds.length === 0
      ? []
      : await tx.whatsappMessage.findMany({
          where: { id: { in: proofIds } },
          select: { id: true, kind: true, fileName: true, occurredAt: true },
        });
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const bookingIds = rows.flatMap((row) => (row.bookingId === null ? [] : [row.bookingId]));
  const made =
    bookingIds.length === 0
      ? []
      : await tx.booking.findMany({ where: { id: { in: bookingIds } }, select: { id: true, number: true } });
  return aiBookingList.parse(
    rows.map((row) => {
      const details = (row.details ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        leadId: row.leadId,
        conversationId: row.conversationId,
        summary: row.summary,
        details: {
          package: text(details.package),
          dates: text(details.dates),
          travellers: text(details.travellers),
          pickup: text(details.pickup),
          amount: text(details.amount),
        },
        status: aiBookingStatus.parse(row.status),
        bookingId: row.bookingId,
        bookingNumber: made.find((booking) => booking.id === row.bookingId)?.number ?? null,
        proofs: proofs
          .filter((proof) => row.proofMessageIds.includes(proof.id))
          .map((proof) => ({
            messageId: proof.id,
            kind: proof.kind,
            fileName: proof.fileName,
            at: proof.occurredAt.toISOString(),
          })),
        createdAt: row.createdAt.toISOString(),
      };
    }),
  );
}

const textsOf = (details: unknown) => {
  const found = (details ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    package: text(found.package),
    dates: text(found.dates),
    travellers: text(found.travellers),
    pickup: text(found.pickup),
    amountPaise: paiseFromRupeesText(text(found.amount)) ?? 0,
  };
};

/** A person decides: the payment is in (the lead is won), the booking is off, or it waits for payment again. */
export async function setBookingStatus(
  tx: OrgTx,
  access: MemberAccess,
  input: { bookingId: string; status: "confirmed" | "cancelled" | "awaiting_payment" },
  now: Date,
): Promise<{ leadId: string }> {
  const row = await tx.aiBooking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, leadId: true, summary: true, details: true, proofMessageIds: true, bookingId: true },
  });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  // Confirming also makes (or finds) the release 6 booking for it: the lead's accepted quote's, or one made from what the AI took
  // down. Confirming again finds the same one.
  const bookingId =
    input.status === "confirmed"
      ? await linkAiBooking(
          tx,
          access,
          {
            leadId: row.leadId,
            summary: row.summary,
            details: textsOf(row.details),
            proofMessageIds: row.proofMessageIds,
            linkedBookingId: row.bookingId,
          },
          now,
        )
      : null;
  await tx.aiBooking.update({
    where: { id: row.id },
    data: {
      status: input.status,
      decidedBy: access.userId,
      decidedAt: now,
      ...(bookingId === null ? {} : { bookingId }),
    },
  });
  if (input.status === "confirmed") await advanceLeadStage(tx, access, { leadId: row.leadId, stage: "won" }, now);
  await recordAudit(tx, access, {
    action: "ai.booking-decided",
    entityType: "ai_booking",
    entityId: row.id,
    after: { status: input.status },
  });
  return { leadId: row.leadId };
}
