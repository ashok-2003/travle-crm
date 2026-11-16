// ai.setBookingStatus: on a plan with bookings a payment is confirmed on Payments to check, never on the lead's page; a
// confirmed booking is never moved back; without bookings the lead's page still confirms.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("ai.setBookingStatus", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  async function anAiBooking(organizationId: string) {
    return harness.db.forOrg(organizationId, async (tx) => {
      const person = await tx.person.create({
        data: { name: "Rahul Sharma", phoneE164: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` },
      });
      const lead = await tx.lead.create({ data: { personId: person.id, source: "web_form" } });
      const booking = await tx.aiBooking.create({
        data: {
          leadId: lead.id,
          conversationId: randomUUID(),
          summary: "Manali 5N",
          details: { amount: "₹20,000" },
          status: "proof_received",
          proofMessageIds: [randomUUID()],
        },
        select: { id: true },
      });
      return booking.id;
    });
  }

  it("with the bookings module, confirming here is refused; calling it off still works", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const bookingId = await anAiBooking(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    expect(await refusal(caller.ai.setBookingStatus({ bookingId, status: "confirmed" }))).toBe("CONFIRM_ON_PAYMENTS");
    await caller.ai.setBookingStatus({ bookingId, status: "cancelled" });
  });

  it("without it, the lead's page confirms, and a confirmed booking is never moved back", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const bookingId = await anAiBooking(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    await caller.ai.setBookingStatus({ bookingId, status: "confirmed" });
    expect(await refusal(caller.ai.setBookingStatus({ bookingId, status: "cancelled" }))).toBe("AI_BOOKING_NOT_OPEN");
    expect(await refusal(caller.ai.setBookingStatus({ bookingId, status: "awaiting_payment" }))).toBe(
      "AI_BOOKING_NOT_OPEN",
    );
  });
});
