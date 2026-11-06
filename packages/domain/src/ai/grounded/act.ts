// Acts on a checked reply in the turn's one transaction: holds the seats and makes the quote at the total code told the
// customer, takes the AI's booking, sends the reply, files and payment details, and saves the chat's facts. The same turn
// token again changes nothing. A refusal throws a DomainError, so the transaction rolls back and nothing is sent.
import type { OrgTx } from "@travel-crm/db";
import { takeGroundedBooking, leadOfChat } from "./act-booking.js";
import { settleChat } from "./act-chat.js";
import { sendReply } from "./act-send.js";
import type { ActDeps, ActInput, ActResult } from "./act-types.js";
import { bookingPackage } from "./actions.js";

export type { ActDeps, ActInput, ActResult };

export async function actOnReply(tx: OrgTx, deps: ActDeps, input: ActInput): Promise<ActResult> {
  const earlier = await tx.whatsappMessage.findFirst({
    where: { clientToken: `ai:${input.token}` },
    select: { id: true },
  });
  if (earlier !== null) return "already";
  const leadId = await leadOfChat(tx, input.conversationId);
  const bookingId = input.actions.requestBooking ? await takeGroundedBooking(tx, deps, input, leadId) : null;
  const sent = await sendReply(tx, deps, input);
  const departure = bookingPackage(input.lookup)?.chosenDeparture ?? null;
  const settled = await settleChat(tx, input, {
    leadId,
    facts: {
      ...input.facts,
      sentFileIds: [...new Set([...input.facts.sentFileIds, ...sent.fileIds])],
      paymentSentFor: sent.pay && departure !== null ? departure.id : input.facts.paymentSentFor,
      bookingId: bookingId ?? input.facts.bookingId,
    },
  });
  return { sent, bookingId, ...settled };
}
