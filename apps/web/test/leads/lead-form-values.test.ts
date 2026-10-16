// The lead form's values checked into the api's input by its own schema (createLeadInput): a name and one contact are
// all it needs; months, budgets and children's ages travel as the api takes them; each refused value is named on its
// field; and a lead's trip reads back into the same fields the form sends (P8).
import type { TripDetail } from "@travel-crm/contracts/crm";
import { describe, expect, it } from "vitest";
import { emptyLeadValues, toCreateLeadInput, type LeadFormValues } from "@/leads/form/lead-form-values";
import { tripInputOf, tripValuesOf } from "@/leads/form/trip-values";

const me = "0199a000-0000-7000-8000-000000000001";
const ravi = "0199a000-0000-7000-8000-0000000000a2";
const kashmir = "0199e7a0-0000-7000-8000-000000000c01";

const values = (changes: Partial<LeadFormValues>): LeadFormValues => ({ ...emptyLeadValues(me), ...changes });
const check = (changes: Partial<LeadFormValues>) => toCreateLeadInput(values(changes), { userId: me });

const nothingAsked = {
  destination: null,
  when: { kind: "unknown" },
  adults: null,
  childrenAges: [],
  budget: null,
  departureCity: null,
  tripType: null,
  hotelCategory: null,
  food: null,
  roomType: null,
};

describe("toCreateLeadInput", () => {
  it("needs a name and one contact", () => {
    expect(check({})).toEqual({ ok: false, problems: { name: "name", phone: "contact" } });
    expect(check({ name: "Rahul", email: "rahul@example.com" }).ok).toBe(true);
    expect(check({ name: "Rahul", instagramHandle: "@Rahul.Travels" }).ok).toBe(true);
  });

  it("sends only a name and a phone, in E.164 with India by default, and nothing else asked", () => {
    expect(check({ name: " Rahul Sharma ", phone: "098765-43210" })).toEqual({
      ok: true,
      input: {
        person: { name: "Rahul Sharma", phone: "+919876543210" },
        trip: nothingAsked,
        note: null,
        source: "phone_call",
        sourceDetail: null,
        ownerUserId: null,
        whenOpenLead: null,
      },
    });
  });

  it("sends the month as YYYY-MM, the budget in paise with its basis, and each child's age", () => {
    const result = check({
      name: "Rahul",
      phone: "98765 43210",
      destination: { kind: "existing", destinationId: kashmir, name: "Kashmir" },
      whenKind: "month",
      month: "2026-12",
      adults: "2",
      childrenAges: ["7", "0"],
      budget: "60,000",
      budgetBasis: "per_person",
      departureCity: "Delhi",
      tripType: "family",
      hotelCategory: "4_star",
      food: "jain",
      roomType: "Twin",
      note: "Wants a houseboat night",
      source: "referral",
      sourceDetail: "Priya Nair",
    });
    expect(result).toEqual({
      ok: true,
      input: {
        person: { name: "Rahul", phone: "+919876543210" },
        trip: {
          destination: { kind: "existing", destinationId: kashmir },
          when: { kind: "month", month: "2026-12" },
          adults: 2,
          childrenAges: [7, 0],
          budget: { amount: { amountPaise: 6_000_000, currency: "INR" }, basis: "per_person" },
          departureCity: "Delhi",
          tripType: "family",
          hotelCategory: "4_star",
          food: "jain",
          roomType: "Twin",
        },
        note: "Wants a houseboat night",
        source: "referral",
        sourceDetail: "Priya Nair",
        ownerUserId: null,
        whenOpenLead: null,
      },
    });
  });

  it("sends dates, a new destination by its name, another owner and the open lead's choice", () => {
    const result = check({
      name: "Rahul",
      phone: "98765 43210",
      destination: { kind: "new", name: "Spiti" },
      whenKind: "dates",
      from: "2026-11-14",
      to: "2026-11-20",
      ownerUserId: ravi,
      whenOpenLead: "new-lead",
    });
    expect(result.ok && result.input).toMatchObject({
      trip: {
        destination: { kind: "new", name: "Spiti" },
        when: { kind: "dates", from: "2026-11-14", to: "2026-11-20" },
      },
      ownerUserId: ravi,
      whenOpenLead: "new-lead",
    });
  });

  it("names each field the api refuses", () => {
    expect(
      check({
        name: "Rahul",
        phone: "12345",
        email: "rahul@",
        instagramHandle: "no spaces allowed",
        adults: "two",
        budget: "lots",
        whenKind: "dates",
        from: "2026-11-20",
        to: "2026-11-14",
      }),
    ).toEqual({
      ok: false,
      problems: {
        phone: "phone",
        email: "email",
        instagramHandle: "instagramHandle",
        adults: "adults",
        budget: "budget",
        to: "to",
      },
    });
    expect(check({ name: "Rahul", phone: "98765 43210", whenKind: "dates" })).toEqual({
      ok: false,
      problems: { from: "from", to: "to" },
    });
    expect(check({ name: "Rahul", phone: "98765 43210", whenKind: "month" })).toEqual({
      ok: false,
      problems: { month: "month" },
    });
    expect(check({ name: "Rahul", phone: "98765 43210", childrenAges: ["4", ""] })).toEqual({
      ok: false,
      problems: { childrenAges: "childAge" },
    });
  });
});

describe("trip values", () => {
  it("reads a lead's trip into the form's fields, which give the same trip back", () => {
    const trip: TripDetail = {
      destination: { id: kashmir, name: "Kashmir" },
      when: { kind: "dates", from: "2026-11-14", to: "2026-11-20" },
      adults: 2,
      childrenAges: [7],
      budget: { amount: { amountPaise: 18_000_000, currency: "INR" }, basis: "for_everyone" },
      departureCity: "Delhi",
      tripType: "family",
      hotelCategory: "any",
      food: null,
      roomType: null,
    };
    const fields = tripValuesOf(trip);
    expect(fields).toMatchObject({ adults: "2", childrenAges: ["7"], budget: "1,80,000", food: "none" });
    expect(tripInputOf(fields)).toEqual({
      ...trip,
      destination: { kind: "existing", destinationId: kashmir },
      budget: { amount: { amountPaise: 18_000_000, currency: "INR" }, basis: "for_everyone" },
    });
  });
});
