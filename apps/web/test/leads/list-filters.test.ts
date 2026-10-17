// The lead list's filters live in the address (R41), so Back from a lead and a shared link keep them. They are read
// with the api's own rules: a value it would refuse is left out, and a salesperson, who only ever sees their own
// leads, has no view or owner to choose. The search is never in the address: a name or a phone in a URL reaches the
// access logs and the Referer (the list keeps it in the tab, use-list-search.ts).
import type { ListLeadsInput } from "@travel-crm/contracts/crm";
import { describe, expect, it } from "vitest";
import { isFiltered, leadHref, listFiltersHref, listFiltersOf } from "@/leads/list/list-filters";

const ravi = "0199a000-0000-7000-8000-0000000000a2";
const goa = "0199e7a0-0000-7000-8000-000000000c02";

const address = (query: string) => new URLSearchParams(query);

describe("listFiltersOf", () => {
  it("reads ?view=everyone&stage=new, and drops view and owner for a salesperson", () => {
    const query = `view=everyone&stage=new&owner=${ravi}&source=referral&destination=${goa}&tripType=trek`;
    expect(listFiltersOf(address(query), "all")).toEqual({
      view: "everyone",
      stage: "new",
      ownerUserId: ravi,
      source: "referral",
      destinationId: goa,
      tripType: "trek",
      limit: 25,
    });
    expect(listFiltersOf(address(query), "own")).toEqual({
      view: "mine",
      stage: "new",
      source: "referral",
      destinationId: goa,
      tripType: "trek",
      limit: 25,
    });
  });

  it("opens on Mine · open, and leaves out what the api would refuse", () => {
    expect(listFiltersOf(address(""), "all")).toEqual({ view: "mine", stage: "open", limit: 25 });
    const nonsense = "view=all&stage=archived&owner=ravi&source=tv&destination=goa&tripType=cruise";
    expect(listFiltersOf(address(nonsense), "all")).toEqual({ view: "mine", stage: "open", limit: 25 });
  });

  it("keeps an owner only for everyone's leads", () => {
    expect(listFiltersOf(address(`owner=${ravi}`), "all")).toEqual({ view: "mine", stage: "open", limit: 25 });
  });

  it("never reads a search from the address, even an old link's ?q=", () => {
    expect(listFiltersOf(address("q=rahul&stage=new"), "all")).toEqual({ view: "mine", stage: "new", limit: 25 });
  });
});

describe("listFiltersHref", () => {
  it("writes only what differs from Mine · open, so the plain list is /leads", () => {
    expect(listFiltersHref({ view: "mine", stage: "open" })).toBe("/leads");
    expect(listFiltersHref({ view: "everyone", stage: "won", ownerUserId: ravi })).toBe(
      `/leads?view=everyone&stage=won&owner=${ravi}`,
    );
  });

  it("reads back what it wrote", () => {
    const filters = {
      view: "everyone",
      stage: "lost",
      ownerUserId: ravi,
      source: "instagram",
      destinationId: goa,
      tripType: "honeymoon",
    } as const;
    const href = new URL(listFiltersHref(filters), "http://localhost");
    expect(listFiltersOf(href.searchParams, "all")).toEqual({ ...filters, limit: 25 });
  });

  it("carries the list's filters to a lead, for its way back", () => {
    expect(leadHref(goa, { view: "everyone", stage: "new" })).toBe(`/leads/${goa}?view=everyone&stage=new`);
    expect(leadHref(goa, { view: "mine", stage: "open" })).toBe(`/leads/${goa}`);
  });

  it("leaves the search out of every address, given the list's whole input", () => {
    const input: ListLeadsInput = { view: "everyone", stage: "new", search: "Rahul 98765", limit: 25 };
    expect(listFiltersHref(input)).toBe("/leads?view=everyone&stage=new");
    expect(leadHref(goa, input)).toBe(`/leads/${goa}?view=everyone&stage=new`);
  });
});

describe("isFiltered", () => {
  it("is true for anything but the whole of Mine or Everyone · open", () => {
    expect(isFiltered({ view: "everyone", stage: "open" })).toBe(false);
    expect(isFiltered({ view: "mine", stage: "new" })).toBe(true);
    expect(isFiltered({ view: "mine", stage: "open", search: "rahul" })).toBe(true);
    expect(isFiltered({ view: "mine", stage: "open", tripType: "solo" })).toBe(true);
  });
});
