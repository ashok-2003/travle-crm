// The lead list's and the known contact's contracts (spec 3.2, 3.3): Mine · open by default, 25 a page, a search of
// two characters or more; a known contact names an open lead by its destination and owner, its id only when visible.
import { describe, expect, it } from "vitest";
import { knownContactResult, leadCountsInput, leadListItem, listLeadsInput } from "../../src/crm/index.js";

const id = "0199e7a0-0000-7000-8000-0000000000e1";

describe("the lead list", () => {
  it("defaults to Mine · open, 25 a page, and keeps a search between 2 and 80 characters", () => {
    expect(listLeadsInput.parse({})).toEqual({ view: "mine", stage: "open", limit: 25 });
    expect(listLeadsInput.parse({ view: "everyone", stage: "lost", search: "  shrma " })).toMatchObject({
      view: "everyone",
      stage: "lost",
      search: "shrma",
    });
    for (const bad of [{ search: "r" }, { search: "x".repeat(81) }, { limit: 51 }, { stage: "closed" }]) {
      expect(listLeadsInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(leadCountsInput.safeParse({ view: "mine", stage: "open" }).success).toBe(false);
  });

  it("shows a row's budget as Money and its next step", () => {
    const row = leadListItem.parse({
      id,
      person: { name: "Rahul Sharma", phone: "+919876543210" },
      returning: false,
      stage: "new",
      trip: { destinationName: "Kashmir", when: { kind: "month", month: "2026-12" }, adults: 2, childrenCount: 1 },
      source: "phone_call",
      ownerUserId: id,
      budget: { amount: { amountPaise: 1_80_000_00, currency: "INR" }, basis: "per_person" },
      createdAt: "2026-10-16T10:00:00.000Z",
      next: { awaitingReplySince: "2026-10-16T10:00:00.000Z", task: null },
      internal: "dropped",
    });
    expect(row).not.toHaveProperty("internal");
    expect(row.budget?.amount.amountPaise).toBe(1_80_000_00);
  });
});

describe("a known contact", () => {
  it("names the person, how they matched, and an open lead's destination and owner", () => {
    const answer = {
      match: {
        personId: id,
        personName: "Rahul Sharma",
        matchedBy: "phone",
        openLead: { leadId: null, destinationName: "Kashmir", ownerUserId: id },
      },
      blocked: false,
      people: { [id]: "Asha" },
    };
    expect(knownContactResult.parse(answer)).toEqual(answer);
    expect(knownContactResult.parse({ match: null, blocked: true, people: {} }).match).toBeNull();
  });
});
