// quotes.page and quotes.salespeople (bookings revamp, 2026-11-27), on a real database: each row says what it waits for
// (a quote behind an AI booking nobody has paid) and names its salesperson (nobody for a lead nobody owns); a member who
// sees only their own quotes gets only theirs, total and all; the salespeople go only to a member who sees every quote.
import { randomUUID } from "node:crypto";
import { PermissionSet } from "@travel-crm/domain/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, memberOf, type Harness } from "./forms-support.js";

describe("the quotes table's procedures", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  /** A draft quote on a lead owned by ownerUserId (or nobody), and, when told, an AI booking waiting for its payment. */
  const aQuote = (organizationId: string, ownerUserId: string | null, waiting = false) =>
    harness.db.forOrg(organizationId, async (tx) => {
      const phoneE164 = `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
      const person = await tx.person.create({ data: { name: "Meera Iyer", phoneE164 } });
      const lead = await tx.lead.create({ data: { personId: person.id, source: "phone_call", ownerUserId } });
      const quote = await tx.quote.create({
        data: { leadId: lead.id, title: "Kerala backwaters", subtotalPaise: 100_000_00n, totalPaise: 100_000_00n },
        select: { id: true },
      });
      if (waiting) {
        await tx.aiBooking.create({
          data: {
            leadId: lead.id,
            quoteId: quote.id,
            conversationId: randomUUID(),
            summary: "Kerala 5N",
            details: {},
            status: "awaiting_payment",
          },
        });
      }
      return quote.id;
    });

  const ownOnly = (organizationId: string) => ({
    ...memberOf(organizationId, []),
    permissions: PermissionSet.of([{ permission: "quotes:view", scope: "own" as const }]),
  });

  it("says what each quote waits for and names its salesperson, nobody for a lead nobody owns", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const waiting = await aQuote(organizationId, randomUUID(), true);
    const plain = await aQuote(organizationId, null);
    const { caller } = callerOf(harness, { organizationId });
    const page = await caller.quotes.page({ page: 1, sort: "updated", direction: "asc" });
    expect(page.total).toBe(2);
    expect(page.items.map((item) => [item.id, item.paymentWait, item.ownerName])).toEqual([
      [waiting, "waiting", "Asha Rao"],
      [plain, null, null],
    ]);
    expect(page.items[0]).not.toHaveProperty("ownerUserId");
  });

  it("holds a member who sees only their own quotes to theirs", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const seller = ownOnly(organizationId);
    const mine = await aQuote(organizationId, seller.userId);
    await aQuote(organizationId, randomUUID());
    const { caller } = callerOf(harness, { organizationId }, seller);
    const page = await caller.quotes.page({ page: 1 });
    expect(page.total).toBe(1);
    expect(page.items.map((item) => item.id)).toEqual([mine]);
  });

  it("offers the salespeople, by id and name, only to a member who sees every quote", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const manager = callerOf(harness, { organizationId });
    expect(await manager.caller.quotes.salespeople()).toEqual([{ userId: manager.owner, name: "Asha Rao" }]);
    const seller = callerOf(harness, { organizationId }, ownOnly(organizationId));
    expect(await seller.caller.quotes.salespeople()).toEqual([]);
  });
});
