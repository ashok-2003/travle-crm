// paymentsToCheck: only a member who may view bookings and record payments, on a plan with bookings, lists or decides.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("paymentsToCheck", () => {
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
      return { leadId: lead.id, bookingId: booking.id };
    });
  }

  it("a member without record_payments can't list or confirm", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const { caller } = callerOf(harness, { organizationId, granted: ["bookings:view"] });
    expect(await refusal(caller.paymentsToCheck.list({}))).toBe("MISSING_PERMISSION");
    expect(await refusal(caller.paymentsToCheck.count())).toBe("MISSING_PERMISSION");
    expect(
      await refusal(
        caller.paymentsToCheck.confirm({ kind: "claim", id: randomUUID(), amountPaise: 100, reference: "" }),
      ),
    ).toBe("MISSING_PERMISSION");
  });

  it("an agency without the bookings module can't list", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm"] });
    const { caller } = callerOf(harness, { organizationId });
    expect(await refusal(caller.paymentsToCheck.list({}))).not.toBe("accepted");
    expect(await refusal(caller.paymentsToCheck.count())).not.toBe("accepted");
  });

  it("lists and counts what waits for a member who may", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const ai = await anAiBooking(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    const page = await caller.paymentsToCheck.list({});
    expect(page.items.map((item) => item.id)).toEqual([ai.bookingId]);
    expect(await caller.paymentsToCheck.count()).toEqual({ count: 1 });
  });

  it("confirm says how the customer was told, and a repeat tells no one twice", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const ai = await anAiBooking(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    const input = { kind: "ai_booking", id: ai.bookingId, amountPaise: 2_000_000, reference: "UTR9" } as const;
    // The customer has no chat here, so nothing can be sent: one task for the lead's owner tells them by hand.
    expect(await caller.paymentsToCheck.confirm(input)).toEqual({ told: "task" });
    expect(await caller.paymentsToCheck.confirm(input)).toEqual({ told: "task" });
    const tasks = await harness.db.forOrg(organizationId, (tx) =>
      tx.task.count({ where: { title: { contains: "payment was confirmed" } } }),
    );
    expect(tasks).toBe(1);
    expect(await caller.paymentsToCheck.count()).toEqual({ count: 0 });
  });

  it("refuse tells the customer only when asked", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const quiet = await anAiBooking(organizationId);
    const loud = await anAiBooking(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    expect(
      await caller.paymentsToCheck.refuse({
        kind: "ai_booking",
        id: quiet.bookingId,
        reason: "not_found",
        tell: false,
      }),
    ).toEqual({ told: "none" });
    expect(
      await caller.paymentsToCheck.refuse({ kind: "ai_booking", id: loud.bookingId, reason: "not_found", tell: true }),
    ).toEqual({ told: "task" });
  });
});
