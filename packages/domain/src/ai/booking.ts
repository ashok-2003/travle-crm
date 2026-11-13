// Bookings the AI agent takes (the owner, 2026-10-29; the lite turn writes them, agent-booking.ts): the team is told by
// email and push. A photo or PDF the customer sends while it waits for payment is kept as their
// payment proof (the chat's own message, whose file is already stored) and the team is told to check it. A person
// confirms the payment (the lead is won) or cancels; the agent never says a payment was received.
import { aiBookingList, aiBookingStatus, type AiBooking } from "@travel-crm/contracts/ai";
import { whatsappCustomerWroteEvent } from "@travel-crm/contracts/inbox";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import type { OrgTx } from "@travel-crm/db";
import { linkAiBooking, mayBePaymentTitle, recordUnmatchedProof } from "../bookings/index.js";
import { addAiLeadNote, advanceLeadStage, noticeKey } from "../crm/index.js";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { CUSTOMER_WROTE_EVENT } from "../inbox/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import { recordAudit } from "../audit/index.js";
import { calendarDateIn, DomainError } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import type { SubscriptionAccess } from "../subscriptions/index.js";
import { mayBePayment } from "./payment-likely.js";

export const AI_BOOKING_KIND = "ai.booking";
export const AI_PAYMENT_PROOF_KIND = "ai.payment-proof";
const OPEN_STATUSES = ["awaiting_payment", "proof_received"];
/** What a customer sends as payment proof: a screenshot or a PDF receipt. */
const PROOF_KINDS = ["image", "document"];

/** Who hears about a booking: the lead's owner and the agency's managers. */
export type BookingRecipients = (organizationId: string) => Promise<string[]>;

/**
 * A photo or PDF from a customer whose booking waits for payment is kept as their proof, and the team is told. With no
 * booking waiting it is kept as a proof to match (payments to check), when the agency has the bookings module and a payment
 * is likely in the chat. The team hears once a chat a day, however many files come.
 */
export function aiPaymentProofListener(dependencies: {
  recipients: BookingRecipients;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
}): EventListener {
  return defineListener({
    name: "ai.payment-proof",
    eventType: CUSTOMER_WROTE_EVENT,
    payload: whatsappCustomerWroteEvent,
    handle: async (event, context) => {
      const { conversationId, messageId } = event.payload;
      const looked = await context.forOrg(async (tx) => {
        const message = await tx.whatsappMessage.findUnique({
          where: { id: messageId },
          select: { kind: true, occurredAt: true },
        });
        if (message === null || !PROOF_KINDS.includes(message.kind)) return null;
        const open = await tx.aiBooking.findFirst({
          where: { conversationId, status: { in: OPEN_STATUSES }, createdAt: { lte: message.occurredAt } },
          orderBy: { createdAt: "desc" },
          select: { id: true, leadId: true, summary: true, proofMessageIds: true },
        });
        const day = calendarDateIn(message.occurredAt, await organizationTimeZone(tx, event.organizationId));
        return { open, at: message.occurredAt, day };
      });
      if (looked === null) return;
      const found = looked.open;
      const modules = (await dependencies.subscriptions.entitlementsOf(event.organizationId))?.modules;
      const bookingsOn = modules?.has("bookings") === true;
      if (found === null) {
        if (!bookingsOn) return;
        const managerUserIds = await dependencies.recipients(event.organizationId);
        await context.forOrg(async (tx) => {
          const chat = await tx.whatsappConversation.findUnique({
            where: { id: conversationId },
            select: { personId: true },
          });
          const lead =
            chat?.personId == null
              ? null
              : await tx.lead.findFirst({
                  where: { personId: chat.personId },
                  orderBy: { createdAt: "desc" },
                  select: { id: true },
                });
          const leadId = lead?.id ?? null;
          if (!(await mayBePayment(tx, { conversationId, leadId, at: looked.at }))) return;
          await recordUnmatchedProof(tx, context.actor, {
            conversationId,
            messageId,
            leadId,
            managerUserIds,
            day: looked.day,
          });
        });
        return;
      }
      if (found.proofMessageIds.includes(messageId)) return;
      const recipients = await dependencies.recipients(event.organizationId);
      await context.forOrg(async (tx) => {
        // Only a booking still open takes the proof: one a person decided meanwhile is left as they decided it.
        const moved = await tx.aiBooking.updateMany({
          where: { id: found.id, status: { in: OPEN_STATUSES } },
          data: { status: "proof_received", proofMessageIds: { push: messageId } },
        });
        if (moved.count === 0) return;
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
          sourceEventId: noticeKey(`ai-proof:${conversationId}:${looked.day}`, AI_PAYMENT_PROOF_KIND),
          kind: AI_PAYMENT_PROOF_KIND,
          title: mayBePaymentTitle(lead?.person.name),
          body: `${found.summary}. Check it and confirm the booking.`.slice(0, 300),
          // With bookings it is confirmed on Payments to check; the lead's id in the link lets its erasure find the notice.
          link: bookingsOn ? `/payments?lead=${found.leadId}` : `/leads/${found.leadId}`,
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

/**
 * A person decides: the payment is in (the lead is won), the booking is off, or it waits for payment again. On a plan with
 * the bookings module the payment is confirmed on Payments to check, which records the money and tells the customer, so
 * not here; and a confirmed booking is never moved back, whatever the plan.
 */
export async function setBookingStatus(
  tx: OrgTx,
  access: MemberAccess,
  input: { bookingId: string; status: "confirmed" | "cancelled" | "awaiting_payment" },
  now: Date,
  plan: { bookingsOn: boolean },
): Promise<{ leadId: string }> {
  const row = await tx.aiBooking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      leadId: true,
      summary: true,
      details: true,
      proofMessageIds: true,
      bookingId: true,
      status: true,
    },
  });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  if (input.status === "confirmed" && plan.bookingsOn)
    throw new DomainError("CONFLICT", "CONFIRM_ON_PAYMENTS", "Confirm this payment on Payments to check");
  if (row.status === "confirmed" && input.status !== "confirmed")
    throw new DomainError("CONFLICT", "AI_BOOKING_NOT_OPEN", "This booking was decided already");
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
