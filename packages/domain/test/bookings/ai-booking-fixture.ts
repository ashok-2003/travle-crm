// A booking the AI took, written straight to the tables for the tests of what happens to it (proofs, payments, status):
// the row waiting for payment and the lead at Booking requested, as the lite turn leaves them.
import type { OrgTx } from "@travel-crm/db";
import { advanceLeadStage } from "../../src/crm/index.js";
import { systemActor } from "../../src/kernel/index.js";

export async function takeBooking(
  tx: OrgTx,
  input: {
    organizationId: string;
    conversationId: string;
    leadId: string | null;
    booking: {
      confirmed?: boolean;
      summary: string;
      package: string;
      dates: string;
      travellers: string;
      pickup: string;
      amount: string;
    };
    recipients: readonly string[];
    now: Date;
  },
): Promise<string | null> {
  if (input.leadId === null) return null;
  const { booking } = input;
  const details = {
    package: booking.package.trim(),
    dates: booking.dates.trim(),
    travellers: booking.travellers.trim(),
    pickup: booking.pickup.trim(),
    amount: booking.amount.trim(),
  };
  const summary = (booking.summary.trim() || details.package || "A trip").slice(0, 300);
  const row = await tx.aiBooking.create({
    data: { leadId: input.leadId, conversationId: input.conversationId, summary, details },
    select: { id: true },
  });
  await advanceLeadStage(
    tx,
    systemActor(input.organizationId),
    { leadId: input.leadId, stage: "booking_requested" },
    input.now,
  );
  return row.id;
}
