// The Quotes table's page (bookings revamp, 2026-11-27): searched by the customer's name, a phone's digits and the trip's
// title (LIKE's wildcards are letters); filtered by status, travel dates, salesperson and money still to come on an
// accepted quote; sorted by the last change, newest first, by default, or by travel date (no date last), customer or
// total either way, each ending on the id; counted across its pages; held to a salesperson's own quotes, total and all.
import type { QuoteTablePageInput } from "@travel-crm/contracts/quotes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { quoteTablePageOf } from "../../src/quotes/index.js";
import { aLead, aPerson, freshPhone } from "../crm/support/records.js";
import { openWorld, type World } from "../bookings/support.js";

let world: World;
beforeEach(async () => {
  world = await openWorld("Quotes table");
});
afterEach(async () => {
  await world.close();
});

interface Seed {
  name?: string;
  phone?: string;
  title?: string;
  status?: "draft" | "sent" | "accepted" | "declined";
  startDate?: string | null;
  totalPaise?: number;
  paidPaise?: number;
  /** Minutes after a fixed morning: a later change is newer. */
  changedAt?: number;
  ownerUserId?: string;
}

/** A quote for this customer and trip, the seller's lead's unless another owns it, and what was paid on it. */
async function aTableQuote(seed: Seed = {}): Promise<string> {
  return world.inOrg(async (tx) => {
    const person = await aPerson(tx, { name: seed.name ?? "Rahul Sharma", phoneE164: seed.phone ?? freshPhone() });
    const lead = await aLead(tx, { personId: person.id, ownerUserId: seed.ownerUserId ?? world.seller.userId });
    const total = BigInt(seed.totalPaise ?? 100_000_00);
    const quote = await tx.quote.create({
      data: {
        leadId: lead.id,
        title: seed.title ?? "Spiti 6 days",
        status: seed.status ?? "draft",
        startDate:
          seed.startDate === undefined || seed.startDate === null ? null : new Date(`${seed.startDate}T00:00:00Z`),
        subtotalPaise: total,
        totalPaise: total,
        ...(seed.status === "accepted" && { acceptedAt: new Date("2026-10-29T05:00:00Z"), acceptedName: "Rahul" }),
        updatedAt: new Date(Date.UTC(2026, 9, 29, 5, seed.changedAt ?? 0)),
      },
      select: { id: true },
    });
    if (seed.paidPaise !== undefined) {
      await tx.quotePayment.create({
        data: {
          quoteId: quote.id,
          amountPaise: BigInt(seed.paidPaise),
          receivedOn: new Date("2026-10-29"),
          method: "upi",
        },
      });
    }
    return quote.id;
  });
}

const page = (access: MemberAccess, input: Partial<QuoteTablePageInput> = {}) =>
  world.inOrg((tx) =>
    quoteTablePageOf(tx, access, { page: 1, limit: 25, sort: "updated", direction: "desc", ...input }),
  );

const names = async (access: MemberAccess, input: Partial<QuoteTablePageInput> = {}) =>
  (await page(access, input)).items.map((item) => item.customerName);

describe("the quotes table's page", () => {
  it("searches the customer's name, a phone's digits and the trip's title, wildcards as letters", async () => {
    await aTableQuote({ name: "Asha Verma", phone: "+919876543210", title: "Goa beach week" });
    await aTableQuote({ name: "Kiran Joshi", phone: "+919833300000", title: "Goa 100% a_t" });
    await aTableQuote({ name: "रवि शर्मा", phone: "+919811100000", title: "Spiti circuit" });
    const { seller } = world;
    expect(await names(seller, { search: "ASHA" })).toEqual(["Asha Verma"]);
    expect(await names(seller, { search: "रवि" })).toEqual(["रवि शर्मा"]);
    expect(await names(seller, { search: "+91 98765 43210" })).toEqual(["Asha Verma"]);
    expect(await names(seller, { search: "098765" })).toEqual(["Asha Verma"]);
    // Fewer than four digits look in no phone (as Leads): "98" is in every Indian mobile.
    expect(await names(seller, { search: "98" })).toEqual([]);
    expect(await names(seller, { search: "987" })).toEqual([]);
    expect(await names(seller, { search: "spiti" })).toEqual(["रवि शर्मा"]);
    expect(await names(seller, { search: "%" })).toEqual(["Kiran Joshi"]);
    expect(await names(seller, { search: "o_a" })).toEqual([]);
    expect(await names(seller, { search: "" })).toHaveLength(3);
  });

  it("filters by status, travel dates, salesperson and money still to come", async () => {
    await aTableQuote({ name: "Draft", startDate: "2026-12-20", changedAt: 1 });
    await aTableQuote({
      name: "Owes",
      status: "accepted",
      startDate: "2027-01-10",
      paidPaise: 30_000_00,
      changedAt: 2,
    });
    await aTableQuote({ name: "Paid", status: "accepted", startDate: null, paidPaise: 100_000_00, changedAt: 3 });
    await aTableQuote({ name: "Sent", status: "sent", startDate: "2026-12-24", changedAt: 4 });
    await aTableQuote({ name: "Manager's", startDate: "2026-12-26", ownerUserId: world.manager.userId, changedAt: 5 });
    const { manager } = world;
    expect(await names(manager, { status: "accepted" })).toEqual(["Paid", "Owes"]);
    expect(await names(manager, { balanceDue: true })).toEqual(["Owes"]);
    expect(await names(manager, { travelFrom: "2026-12-01", travelTo: "2026-12-31" })).toEqual([
      "Manager's",
      "Sent",
      "Draft",
    ]);
    expect(await names(manager, { travelFrom: "2026-12-25" })).toEqual(["Manager's", "Owes"]);
    expect(await names(manager, { ownerUserId: world.manager.userId })).toEqual(["Manager's"]);
  });

  it("sorts by the last change, newest first, by default; by travel date (no date last), customer or total either way", async () => {
    await aTableQuote({ name: "Zoya", startDate: "2026-12-20", totalPaise: 50_000_00, changedAt: 1 });
    await aTableQuote({ name: "Arjun", startDate: "2026-12-20", totalPaise: 90_000_00, changedAt: 2 });
    await aTableQuote({ name: "Meera", startDate: null, totalPaise: 70_000_00, changedAt: 3 });
    await aTableQuote({ name: "Bela", startDate: "2026-11-15", totalPaise: 20_000_00, changedAt: 4 });
    const { seller } = world;
    expect(await names(seller)).toEqual(["Bela", "Meera", "Arjun", "Zoya"]);
    expect(await names(seller, { direction: "asc" })).toEqual(["Zoya", "Arjun", "Meera", "Bela"]);
    // Zoya's and Arjun's trips start the same day: Zoya's quote, made first, has the lower id.
    expect(await names(seller, { sort: "travel", direction: "asc" })).toEqual(["Bela", "Zoya", "Arjun", "Meera"]);
    expect(await names(seller, { sort: "travel", direction: "desc" })).toEqual(["Arjun", "Zoya", "Bela", "Meera"]);
    expect(await names(seller, { sort: "customer", direction: "asc" })).toEqual(["Arjun", "Bela", "Meera", "Zoya"]);
    expect(await names(seller, { sort: "total", direction: "desc" })).toEqual(["Arjun", "Meera", "Zoya", "Bela"]);
  });

  it("counts every match across its pages and hands each page its own rows", async () => {
    for (let index = 0; index < 27; index += 1)
      await aTableQuote({ name: `Customer ${String(index)}`, changedAt: index });
    const { seller } = world;
    const [one, two] = [await page(seller), await page(seller, { page: 2 })];
    expect([one.total, two.total]).toEqual([27, 27]);
    expect([one.items.length, two.items.length]).toEqual([25, 2]);
    expect(new Set([...one.items, ...two.items].map((item) => item.id)).size).toBe(27);
  });

  it("gives each row its summary and the lead's owner", async () => {
    const id = await aTableQuote({ name: "Meera", status: "accepted", paidPaise: 40_000_00 });
    const [item] = (await page(world.manager)).items;
    expect(item).toMatchObject({
      id,
      customerName: "Meera",
      status: "accepted",
      paymentWait: null,
      totals: { totalPaise: 100_000_00, paidPaise: 40_000_00, balancePaise: 60_000_00 },
      ownerUserId: world.seller.userId,
    });
  });

  it("holds a member who sees only their own to theirs, total and search too, and ignores their salesperson filter", async () => {
    await aTableQuote({ name: "Mine" });
    await aTableQuote({ name: "Theirs", ownerUserId: world.manager.userId });
    const { seller, manager } = world;
    expect(await page(manager)).toMatchObject({ total: 2 });
    expect(await page(seller)).toMatchObject({ total: 1, items: [{ customerName: "Mine" }] });
    expect(await names(seller, { search: "Theirs" })).toEqual([]);
    expect(await page(seller, { ownerUserId: manager.userId })).toMatchObject({
      total: 1,
      items: [{ customerName: "Mine" }],
    });
  });
});
