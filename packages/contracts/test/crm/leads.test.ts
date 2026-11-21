// The lead list's and the known contact's contracts (spec 3.2, 3.3): Mine · open by default, 25 a page, a search of
// two characters or more; a known contact names an open lead by its destination and owner, its id only when visible.
import { describe, expect, it } from "vitest";
import {
  knownContactResult,
  leadCountsInput,
  leadExportFilter,
  leadListItem,
  leadListPage,
  listLeadsInput,
} from "../../src/crm/index.js";

const id = "0199e7a0-0000-7000-8000-0000000000e1";

describe("the lead list", () => {
  it("defaults to Mine · open, 25 a page, and keeps a search between 2 and 80 characters", () => {
    expect(listLeadsInput.parse({})).toEqual({ view: "mine", stage: "open", limit: 25 });
    expect(listLeadsInput.parse({ view: "everyone", stage: "lost", search: "  shrma " })).toMatchObject({
      view: "everyone",
      stage: "lost",
      search: "shrma",
    });
    for (const bad of [{ search: "r" }, { search: "x".repeat(81) }, { limit: 101 }, { stage: "closed" }]) {
      expect(listLeadsInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(leadCountsInput.safeParse({ view: "mine", stage: "open" }).success).toBe(false);
  });

  it("takes a page number from 1, up to 100 a page, and keeps paging out of the counts and the export", () => {
    expect(listLeadsInput.parse({ page: 2, limit: 100 })).toEqual({ view: "mine", stage: "open", page: 2, limit: 100 });
    for (const bad of [{ page: 0 }, { page: 1.5 }, { page: "2" }, { page: 10_001 }, { limit: 0 }]) {
      expect(listLeadsInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(leadCountsInput.safeParse({ view: "mine", page: 1 }).success).toBe(false);
    expect(leadExportFilter.safeParse({ view: "mine", stage: "open", page: 1 }).success).toBe(false);
  });

  it("shows one of Home's kinds of work at a time, in the list, its counts and its export", () => {
    for (const show of ["hot", "overdue", "uncontacted", "ai"]) {
      expect(listLeadsInput.parse({ show })).toMatchObject({ show });
      expect(leadCountsInput.parse({ show })).toMatchObject({ show });
      expect(leadExportFilter.parse({ view: "mine", stage: "open", show })).toMatchObject({ show });
    }
    expect(listLeadsInput.parse({})).not.toHaveProperty("show");
    for (const bad of [{ show: "cold" }, { show: ["hot", "ai"] }, { show: "" }]) {
      expect(listLeadsInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("says a numbered page's total, and none for a page after a cursor", () => {
    expect(leadListPage.parse({ items: [], nextCursor: null, total: 349, people: {} }).total).toBe(349);
    expect(leadListPage.parse({ items: [], nextCursor: null, total: null, people: {} }).total).toBeNull();
  });

  it("shows a row's budget as Money and its next step", () => {
    const row = leadListItem.parse({
      id,
      person: { name: "Rahul Sharma", phone: "+919876543210" },
      returning: false,
      aiFilled: false,
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
