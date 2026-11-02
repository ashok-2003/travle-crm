// Each form's values and the fill's paths, both ways: what a proposal sets, what the form holds after, and when a value counts
// as the person's own again (so the violet goes).
import { describe, expect, it } from "vitest";
import { callConverter, leadConverter, quoteConverter, sameValue, type CallValues } from "@/ai/fill/fill-converters";
import { emptyLeadValues, type LeadFormValues } from "@/leads/form/lead-form-values";

const lead = (patch: Partial<LeadFormValues> = {}): LeadFormValues => ({ ...emptyLeadValues("me"), ...patch });

describe("the lead form", () => {
  it("reads nothing from an empty form, and what is typed in the proposal's own shape", () => {
    expect(Object.values(leadConverter.read(lead())).filter((value) => value !== undefined)).toEqual([]);
    const read = leadConverter.read(
      lead({
        name: " Rahul ",
        phone: "98765 43210",
        adults: "4",
        whenKind: "month",
        month: "2026-12",
        budget: "1,00,000",
      }),
    );
    expect(read).toMatchObject({
      "person.name": "Rahul",
      "person.phone": "+919876543210",
      "trip.adults": 4,
      "trip.when": { kind: "month", month: "2026-12" },
      "trip.budget": { amount: { amountPaise: 10_000_000, currency: "INR" }, basis: "per_person" },
    });
  });

  it("sets the form's values from a proposal, and reads them back as the same value", () => {
    const proposed: Record<string, unknown> = {
      "person.phone": "+919876543210",
      "trip.destination": { kind: "existing", destinationId: "d1", name: "Manali" },
      "trip.when": { kind: "dates", from: "2026-12-15", to: "2026-12-20" },
      "trip.childrenAges": [5, 9],
      "trip.budget": { amount: { amountPaise: 10_000_000, currency: "INR" }, basis: "for_everyone" },
      "trip.hotelCategory": "4_star",
    };
    let values = lead();
    for (const [path, value] of Object.entries(proposed)) {
      values = { ...values, ...leadConverter.patch(path as never, value) };
    }
    expect(values).toMatchObject({
      phone: "98765 43210",
      whenKind: "dates",
      from: "2026-12-15",
      to: "2026-12-20",
      childrenAges: ["5", "9"],
      budget: "1,00,000",
      budgetBasis: "for_everyone",
      hotelCategory: "4_star",
    });
    const read = leadConverter.read(values);
    for (const [path, value] of Object.entries(proposed))
      expect(sameValue(path as never, read[path as never], value)).toBe(true);
    // Editing one makes it the person's own.
    const edited = leadConverter.read({ ...values, adults: "5", hotelCategory: "3_star" });
    expect(sameValue("trip.hotelCategory", edited["trip.hotelCategory"], "4_star")).toBe(false);
  });

  it("matches a new destination by its name in any case", () => {
    expect(sameValue("trip.destination", { kind: "new", name: "Spiti" }, { kind: "new", name: "spiti" })).toBe(true);
    expect(
      sameValue(
        "trip.destination",
        { kind: "existing", destinationId: "a", name: "X" },
        { kind: "existing", destinationId: "b", name: "X" },
      ),
    ).toBe(false);
  });
});

describe("the call note form", () => {
  const call = (patch: Partial<CallValues> = {}): CallValues => ({
    outcome: "spoke",
    note: "",
    followUp: false,
    day: "",
    time: "",
    followUpTitle: "",
    ...patch,
  });

  it("does not count the starting outcome as an answer, but counts one chosen or written with a note", () => {
    expect(callConverter.read(call())["call.outcome"]).toBeUndefined();
    expect(callConverter.read(call({ outcome: "busy" }))["call.outcome"]).toBe("busy");
    expect(callConverter.read(call({ note: "Spoke to him" }))["call.outcome"]).toBe("spoke");
  });

  it("sets a follow-up with its day, time and title", () => {
    const values = {
      ...call(),
      ...callConverter.patch("call.followUp", { due: { on: "2026-12-03", at: "17:00" }, title: "Send quote" }),
    };
    expect(values).toMatchObject({ followUp: true, day: "2026-12-03", time: "17:00", followUpTitle: "Send quote" });
    expect(callConverter.read(values)["call.followUp"]).toEqual({
      due: { on: "2026-12-03", at: "17:00" },
      title: "Send quote",
    });
  });
});

describe("the quote form", () => {
  it("fills the lines without a price, and reads them back without one", () => {
    const patched = quoteConverter.patch("quote.items", [{ description: "Hotel", detail: "", quantity: 2 }]);
    expect(patched).toEqual({ items: [{ description: "Hotel", detail: "", quantity: "2", price: "" }] });
    const values = {
      title: "",
      startDate: "",
      adults: "0",
      children: "0",
      days: [],
      items: patched.items ?? [],
      taxRate: "500",
      placeOfSupply: "own",
      inclusions: "",
      exclusions: "",
      notes: "",
    };
    expect(quoteConverter.read(values)["quote.items"]).toEqual([{ description: "Hotel", detail: "", quantity: 2 }]);
    expect(quoteConverter.read(values)["quote.adults"]).toBeUndefined();
  });
});
