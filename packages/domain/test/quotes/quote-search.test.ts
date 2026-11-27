// The quotes list's search: a customer's name (any case, Devanagari too), a phone's digits however typed, a trip's title;
// within the member's scope; an empty search lists everything.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listQuotes } from "../../src/quotes/index.js";
import { aLead, aPerson } from "../crm/support/records.js";
import { openWorld, type World } from "../bookings/support.js";

describe("searching the quotes list", () => {
  let world: World;
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    world = await openWorld("QuoteSearch");
    await world.inOrg(async (tx) => {
      const make = async (key: string, name: string, phone: string, title: string, ownerUserId: string) => {
        const person = await aPerson(tx, { name, phoneE164: phone });
        const lead = await aLead(tx, { personId: person.id, ownerUserId, stage: "contacted" });
        const quote = await tx.quote.create({
          data: { leadId: lead.id, title, subtotalPaise: 1n, totalPaise: 1n },
          select: { id: true },
        });
        ids[key] = quote.id;
      };
      await make("asha", "Asha Verma", "+919876543210", "Goa beach week", world.seller.userId);
      await make("ravi", "रवि शर्मा", "+919811100000", "Spiti circuit", world.seller.userId);
      await make("wild", "Kiran Joshi", "+919833300000", "Goa 98 100% a_t", world.seller.userId);
      await make("plain", "Kiran Das", "+919844498000", "Kullu", world.seller.userId);
      await make("other", "Asha Nair", "+919822200000", "Goa again", world.manager.userId);
    });
  });
  afterAll(async () => {
    await world.close();
  });

  const found = (search: string | undefined, who = world.manager) =>
    world.inOrg(async (tx) =>
      (await listQuotes(tx, who, search === undefined ? {} : { search })).map((quote) => quote.id).sort(),
    );

  it("finds by name in any case", async () => {
    expect(await found("asha verma")).toEqual([ids.asha]);
    expect(await found("ASHA")).toEqual([ids.asha, ids.other].sort());
  });

  it("finds a Devanagari name", async () => {
    expect(await found("रवि")).toEqual([ids.ravi]);
  });

  it("finds by a phone typed with +91 and spaces, bare, or in part", async () => {
    expect(await found("+91 98765 43210")).toEqual([ids.asha]);
    expect(await found("9876543210")).toEqual([ids.asha]);
    expect(await found("98765")).toEqual([ids.asha]);
  });

  it("finds by the trip's title", async () => {
    expect(await found("spiti")).toEqual([ids.ravi]);
  });

  it("takes % and _ as letters, not wildcards", async () => {
    expect(await found("%")).toEqual([ids.wild]);
    expect(await found("a_t")).toEqual([ids.wild]);
    expect(await found("o_a")).toEqual([]);
  });

  it("reads text with letters and digits as a name or title, not a phone", async () => {
    expect(await found("Goa 98")).toEqual([ids.wild]);
  });

  it("lists everything for an empty search", async () => {
    expect(await found("  ")).toHaveLength(5);
    expect(await found(undefined)).toHaveLength(5);
  });

  it("stays within the member's scope", async () => {
    expect(await found("asha", world.seller)).toEqual([ids.asha]);
  });
});
