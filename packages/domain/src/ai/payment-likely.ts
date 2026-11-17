// Whether a photo or file a customer sent may be a payment (P3-14), so it is kept for a person to match: payment details or
// a payment QR went to the chat in the 14 days before it, or the lead has a sent or accepted quote with money still due. A
// passport or a selfie in a chat with nothing to pay is never listed.
import type { OrgTx } from "@travel-crm/db";

const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

export async function mayBePayment(
  tx: OrgTx,
  input: { conversationId: string; leadId: string | null; at: Date },
): Promise<boolean> {
  const asked = await tx.whatsappMessage.findFirst({
    where: {
      conversationId: input.conversationId,
      direction: "out",
      occurredAt: { gte: new Date(input.at.getTime() - RECENT_MS), lte: input.at },
      OR: [
        // The payment details the earlier first agent sent ("ai-pay:"): a chat it was in at the move still counts for 14 days.
        { clientToken: { startsWith: "ai-pay:" } },
        // The turn's payment text ("ai:<turn>:pay") and the package's payment QR ("ai:<turn>:qr").
        { clientToken: { startsWith: "ai:", endsWith: ":pay" } },
        { clientToken: { startsWith: "ai:", endsWith: ":qr" } },
      ],
    },
    select: { id: true },
  });
  if (asked !== null) return true;
  if (input.leadId === null) return false;
  const quotes = await tx.quote.findMany({
    where: { leadId: input.leadId, status: { in: ["sent", "accepted"] } },
    select: { totalPaise: true, payments: { where: { voidedAt: null }, select: { amountPaise: true } } },
  });
  return quotes.some(
    (quote) => quote.payments.reduce((paid, payment) => paid + payment.amountPaise, 0n) < quote.totalPaise,
  );
}
