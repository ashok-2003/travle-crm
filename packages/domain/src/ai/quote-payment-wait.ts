// Which quotes are behind an AI booking nobody has paid: the quote stays a draft, so the list names what it waits for.
import type { QuotePaymentWait } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";

const OPEN = ["awaiting_payment", "proof_received"];

/**
 * "waiting" while the lead's seats on the quote's departure are held, "hold_expired" once they are not; a quote that is
 * accepted or declined, whose booking is confirmed or cancelled, or that no AI booking points at, has no entry.
 */
export async function paymentWaitsOf(
  tx: OrgTx,
  quoteIds: readonly string[],
  now: Date,
): Promise<Map<string, QuotePaymentWait>> {
  const waits = new Map<string, QuotePaymentWait>();
  if (quoteIds.length === 0) return waits;
  const bookings = await tx.aiBooking.findMany({
    where: {
      quoteId: { in: [...quoteIds] },
      status: { in: OPEN },
      quote: { status: { notIn: ["accepted", "declined"] } },
    },
    select: { quoteId: true, leadId: true, quote: { select: { departureId: true } } },
  });
  const departureIds = bookings.flatMap((booking) =>
    booking.quote?.departureId == null ? [] : [booking.quote.departureId],
  );
  const holds =
    departureIds.length === 0
      ? []
      : await tx.departureHold.findMany({
          where: { departureId: { in: departureIds }, status: "active", expiresAt: { gt: now } },
          select: { leadId: true, departureId: true },
        });
  const held = new Set(holds.map((hold) => `${hold.leadId}:${hold.departureId}`));
  for (const booking of bookings) {
    if (booking.quoteId === null) continue;
    const departureId = booking.quote?.departureId;
    const live = departureId != null && held.has(`${booking.leadId}:${departureId}`);
    // A quote without a departure holds no seats, so there is no hold to lapse.
    waits.set(booking.quoteId, departureId == null || live ? "waiting" : "hold_expired");
  }
  return waits;
}
