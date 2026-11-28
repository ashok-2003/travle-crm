// bookings.page and bookings.salespeople (bookings revamp, 2026-11-27), on a real database: the page names each booking's
// salesperson (none for a lead nobody owns) and holds a member who sees only their own to theirs, total and all; the
// salespeople go only to a member who sees every booking, as a user id and a name.
import { randomUUID } from "node:crypto";
import { PermissionSet } from "@travel-crm/domain/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, memberOf, type Harness } from "./forms-support.js";

describe("the bookings table's procedures", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  let numbered = 0;
  /** A booking on an accepted quote, its lead owned by ownerUserId (or nobody). */
  const aBooking = (organizationId: string, ownerUserId: string | null) =>
    harness.db.forOrg(organizationId, async (tx) => {
      const phoneE164 = `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
      const person = await tx.person.create({ data: { name: "Meera Iyer", phoneE164 } });
      const lead = await tx.lead.create({ data: { personId: person.id, source: "phone_call", ownerUserId } });
      const quote = await tx.quote.create({
        data: {
          leadId: lead.id,
          title: "Kerala backwaters",
          status: "accepted",
          adults: 2,
          children: 1,
          days: [],
          subtotalPaise: 100_000_00n,
          totalPaise: 100_000_00n,
          acceptedAt: new Date(),
          acceptedName: "Meera Iyer",
        },
        select: { id: true },
      });
      numbered += 1;
      const number = `BK-2026-${String(numbered).padStart(4, "0")}`;
      return tx.booking.create({ data: { quoteId: quote.id, leadId: lead.id, number }, select: { id: true } });
    });

  const ownOnly = (organizationId: string) => ({
    ...memberOf(organizationId, []),
    permissions: PermissionSet.of([{ permission: "bookings:view", scope: "own" as const }]),
  });

  it("names each booking's salesperson, and nobody for a lead nobody owns", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const owned = await aBooking(organizationId, randomUUID());
    const unowned = await aBooking(organizationId, null);
    const { caller } = callerOf(harness, { organizationId });
    const page = await caller.bookings.page({ page: 1 });
    expect(page.total).toBe(2);
    expect(page.items.map((item) => [item.id, item.ownerName, item.adults, item.children])).toEqual([
      [owned.id, "Asha Rao", 2, 1],
      [unowned.id, null, 2, 1],
    ]);
    expect(page.items[0]).not.toHaveProperty("ownerUserId");
  });

  it("holds a member who sees only their own bookings to theirs", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const seller = ownOnly(organizationId);
    const mine = await aBooking(organizationId, seller.userId);
    await aBooking(organizationId, randomUUID());
    const { caller } = callerOf(harness, { organizationId }, seller);
    const page = await caller.bookings.page({ page: 1 });
    expect(page.total).toBe(1);
    expect(page.items.map((item) => item.id)).toEqual([mine.id]);
  });

  it("offers the salespeople, by id and name, only to a member who sees every booking", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const manager = callerOf(harness, { organizationId });
    expect(await manager.caller.bookings.salespeople()).toEqual([{ userId: manager.owner, name: "Asha Rao" }]);
    const seller = callerOf(harness, { organizationId }, ownOnly(organizationId));
    expect(await seller.caller.bookings.salespeople()).toEqual([]);
  });
});
