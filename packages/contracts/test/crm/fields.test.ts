// A person and a trip as staff type them (spec 3.2): a name and one contact, phones read in India's way and stored in
// E.164, emails in lower case, handles without "@", and travel dates that make sense. Inputs refuse unknown keys.
import { describe, expect, it } from "vitest";
import {
  addLeadWorkInput,
  addNoteInput,
  createLeadInput,
  editPersonInput,
  editTripInput,
  instagramHandle,
  knownContactInput,
  listLeadsInput,
  newPerson,
  reassignLeadInput,
  timelineInput,
  travelWhen,
  tripInput,
} from "../../src/crm/index.js";

const emptyTrip = {
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

const newLead = {
  person: { name: "Rahul Sharma", phone: "98765 43210" },
  trip: emptyTrip,
  note: null,
  source: "phone_call",
  sourceDetail: null,
  ownerUserId: null,
  whenOpenLead: null,
};

describe("a person's fields", () => {
  it("needs a name and at least one contact", () => {
    expect(newPerson.safeParse({ name: "Rahul", email: "rahul@example.in" }).success).toBe(true);
    expect(newPerson.safeParse({ name: "Rahul", instagramHandle: "rahul.s" }).success).toBe(true);
    const noContact = newPerson.safeParse({ name: "Rahul" });
    expect(noContact.success).toBe(false);
    expect(noContact.error?.issues[0]?.path).toEqual(["phone"]);
    expect(newPerson.safeParse({ name: "   ", phone: "98765 43210" }).success).toBe(false);
    expect(newPerson.safeParse({ name: "x".repeat(121), phone: "98765 43210" }).success).toBe(false);
    expect(knownContactInput.safeParse({}).success).toBe(false);
  });

  it("reads 098765-43210 and +91 98765 43210 as +919876543210", () => {
    for (const typed of ["98765 43210", "098765-43210", "+91 98765 43210"]) {
      expect(newPerson.parse({ name: "Rahul", phone: typed }).phone, typed).toBe("+919876543210");
    }
    expect(newPerson.parse({ name: "Ann", phone: "+1 415 555 2671" }).phone).toBe("+14155552671");
    expect(newPerson.safeParse({ name: "Rahul", phone: "12345" }).success).toBe(false);
  });

  it("lower-cases email and strips one @ from a handle", () => {
    expect(newPerson.parse({ name: "Rahul", email: " Rahul@Example.IN " }).email).toBe("rahul@example.in");
    expect(instagramHandle.parse("@Rahul.S")).toBe("rahul.s");
    expect(instagramHandle.parse(" rahul_travels ")).toBe("rahul_travels");
    for (const bad of ["@@rahul", "rahul sharma", "", "a".repeat(31), "राहुल"]) {
      expect(instagramHandle.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("a trip's fields", () => {
  it("refuses a trip whose dates end before they start, and a month not YYYY-MM", () => {
    expect(travelWhen.safeParse({ kind: "dates", from: "2026-11-14", to: "2026-11-20" }).success).toBe(true);
    expect(travelWhen.safeParse({ kind: "dates", from: "2026-11-14", to: "2026-11-14" }).success).toBe(true);
    const backwards = travelWhen.safeParse({ kind: "dates", from: "2026-11-20", to: "2026-11-14" });
    expect(backwards.success).toBe(false);
    expect(backwards.error?.issues[0]?.path).toEqual(["to"]);
    expect(travelWhen.safeParse({ kind: "month", month: "2026-12" }).success).toBe(true);
    for (const month of ["2026-13", "2026-1", "Dec 2026", "2026-12-01"]) {
      expect(travelWhen.safeParse({ kind: "month", month }).success, month).toBe(false);
    }
    expect(travelWhen.safeParse({ kind: "flexible" }).success).toBe(true);
    expect(travelWhen.safeParse({ kind: "someday" }).success).toBe(false);
  });

  it("keeps travellers, ages and budgets within bounds, the budget in paise", () => {
    const trip = (changes: object) => tripInput.safeParse({ ...emptyTrip, ...changes }).success;
    expect(trip({ adults: 2, childrenAges: [0, 17] })).toBe(true);
    expect(trip({ adults: 0 })).toBe(false);
    expect(trip({ childrenAges: [18] })).toBe(false);
    expect(trip({ childrenAges: Array.from({ length: 21 }, () => 5) })).toBe(false);
    const budget = (amountPaise: number) => ({
      budget: { amount: { amountPaise, currency: "INR" }, basis: "per_person" },
    });
    expect(trip(budget(1_80_000_00))).toBe(true);
    expect(trip(budget(0))).toBe(false);
    expect(trip(budget(100_000_000_001))).toBe(false);
    expect(trip({ destination: { kind: "new", name: "  Spiti   Valley " } })).toBe(true);
    expect(
      tripInput.parse({ ...emptyTrip, destination: { kind: "new", name: "  Spiti   Valley " } }).destination,
    ).toEqual({ kind: "new", name: "Spiti Valley" });
    expect(trip({ tripType: "cruise" })).toBe(false);
    const withoutFood = Object.fromEntries(Object.entries(emptyTrip).filter(([key]) => key !== "food"));
    expect(tripInput.safeParse(withoutFood).success).toBe(false);
  });
});

describe("the lead inputs", () => {
  it("refuses unknown keys in every input", () => {
    const leadId = "0199e7a0-0000-7000-8000-0000000000e1";
    const valid: [{ safeParse(value: unknown): { success: boolean } }, object][] = [
      [createLeadInput, newLead],
      [listLeadsInput, {}],
      [timelineInput, { leadId }],
      [addNoteInput, { leadId, body: "Called, no answer" }],
      [reassignLeadInput, { leadId, ownerUserId: leadId }],
      [editTripInput, { leadId, trip: emptyTrip }],
      [editPersonInput, { leadId, person: { name: "Rahul", email: "rahul@example.in" } }],
      [
        addLeadWorkInput,
        { leadId, kind: "follow-up", title: "Send the quote", due: { on: "2026-10-17", at: "16:00" } },
      ],
    ];
    for (const [schema, input] of valid) {
      expect(schema.safeParse(input).success, JSON.stringify(input)).toBe(true);
      expect(schema.safeParse({ ...input, extra: 1 }).success, JSON.stringify(input)).toBe(false);
    }
    for (const nested of [
      { ...newLead, person: { ...newLead.person, age: 30 } },
      { ...newLead, trip: { ...emptyTrip, cruise: true } },
      { ...newLead, trip: { ...emptyTrip, when: { kind: "flexible", month: "2026-12" } } },
    ]) {
      expect(createLeadInput.safeParse(nested).success, JSON.stringify(nested)).toBe(false);
    }
  });

  it("takes only the form's own sources, and an open lead's choice by name, never its id", () => {
    expect(createLeadInput.safeParse({ ...newLead, source: "meta_lead_ad" }).success).toBe(false);
    for (const whenOpenLead of ["add-to-it", "new-lead", null]) {
      expect(createLeadInput.safeParse({ ...newLead, whenOpenLead }).success, String(whenOpenLead)).toBe(true);
    }
    expect(
      createLeadInput.safeParse({ ...newLead, whenOpenLead: "0199e7a0-0000-7000-8000-0000000000e1" }).success,
    ).toBe(false);
  });
});
