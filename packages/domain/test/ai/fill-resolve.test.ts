// Fill it for me, the plain code between the model's words and the form's values: dates and times in words, a budget in words,
// and what a model's answer becomes for each target. Nothing here asks a model or a database.
import { describe, expect, it } from "vitest";
import { callAnswer, leadAnswer, quoteAnswer, tripAnswer } from "@travel-crm/contracts/ai";
import { resolveDay, resolveMonth, resolveTime } from "../../src/ai/fill/dates.js";
import { paiseFromSpoken } from "../../src/ai/fill/money.js";
import { resolveCall, resolveLead, resolveQuote, type ResolveContext } from "../../src/ai/fill/resolve.js";

// A Friday.
const TODAY = "2026-10-30";

describe("dates in words", () => {
  it.each([
    ["today", "2026-10-30"],
    ["aaj", "2026-10-30"],
    ["kal", "2026-10-31"],
    ["tomorrow", "2026-10-31"],
    ["parso", "2026-11-01"],
    ["in 3 days", "2026-11-02"],
    ["Monday", "2026-11-02"],
    ["next Friday", "2026-11-06"],
    ["15 Dec", "2026-12-15"],
    ["15th December", "2026-12-15"],
    ["Dec 15", "2026-12-15"],
    ["15 December 2026", "2026-12-15"],
    ["15/12", "2026-12-15"],
    ["15-12-2026", "2026-12-15"],
    ["2026-12-15", "2026-12-15"],
    // A day with no year that has passed this year is next year's.
    ["5 Jan", "2027-01-05"],
    ["1 Oct", "2027-10-01"],
  ])("%s is %s", (spoken, expected) => {
    expect(resolveDay(spoken, TODAY)).toBe(expected);
  });

  it("never lands in the past and does not guess what it cannot read", () => {
    expect(resolveDay("15 Dec 2025", TODAY)).toBeNull();
    expect(resolveDay("2026-10-01", TODAY)).toBeNull();
    expect(resolveDay("sometime soon", TODAY)).toBeNull();
    expect(resolveDay("31 Feb", TODAY)).toBeNull();
    expect(resolveDay("", TODAY)).toBeNull();
  });

  it("reads a month, never one that has passed", () => {
    expect(resolveMonth("December", TODAY)).toBe("2026-12");
    expect(resolveMonth("next month", TODAY)).toBe("2026-11");
    expect(resolveMonth("jan", TODAY)).toBe("2027-01");
    expect(resolveMonth("2026-12", TODAY)).toBe("2026-12");
    expect(resolveMonth("2026-09", TODAY)).toBeNull();
  });

  it("reads a time", () => {
    expect(resolveTime("5 pm")).toBe("17:00");
    expect(resolveTime("5:30 pm")).toBe("17:30");
    expect(resolveTime("17:00")).toBe("17:00");
    expect(resolveTime("shaam 5 baje")).toBe("17:00");
    expect(resolveTime("subah 9 baje")).toBe("09:00");
    expect(resolveTime("12 am")).toBe("00:00");
    expect(resolveTime("evening")).toBeNull();
  });
});

describe("a budget in words", () => {
  it.each([
    ["1 lakh", 10_000_000],
    ["1.5 lakh", 15_000_000],
    ["1.5L", 15_000_000],
    ["ek lakh", 10_000_000],
    ["50k", 5_000_000],
    ["80,000", 8_000_000],
    ["₹80,000", 8_000_000],
    ["Rs 1,00,000", 10_000_000],
    ["2 crore", 2_000_000_000],
    [250000, 25_000_000],
  ])("%s is %s paise", (spoken, paise) => {
    expect(paiseFromSpoken(spoken)).toBe(paise);
  });

  it("does not guess from words with no amount", () => {
    expect(paiseFromSpoken("flexible")).toBeNull();
    expect(paiseFromSpoken("")).toBeNull();
    expect(paiseFromSpoken(0)).toBeNull();
  });
});

const context: ResolveContext = {
  today: TODAY,
  from: "text",
  matchDestination: (name) =>
    Promise.resolve(
      name.toLowerCase() === "manali" ? { id: "11111111-1111-4111-8111-111111111111", name: "Manali" } : null,
    ),
};
const lead = (json: object) => leadAnswer.parse(json);

describe("a lead from words", () => {
  it("resolves the people, the trip and the budget, and keeps the words they came from", async () => {
    const { fields, questions } = await resolveLead(
      lead({
        name: "Rahul Sharma",
        phone: "98765 43210",
        destination: "manali",
        dateFrom: "15",
        dateTo: "20 Dec",
        adults: "4",
        childrenAges: [5, 9],
        budget: "1 lakh",
        budgetBasis: "for_everyone",
        tripType: "Family",
        hotelCategory: "4 star",
        food: "veg",
        excerpts: { destination: "Manali jana hai", budget: "1 lakh tak" },
      }),
      "lead",
      context,
    );
    const by = Object.fromEntries(fields.map((field) => [field.path, field]));
    expect(by["person.name"]?.value).toBe("Rahul Sharma");
    expect(by["person.phone"]?.value).toBe("+919876543210");
    expect(by["trip.destination"]).toMatchObject({
      value: { kind: "existing", destinationId: "11111111-1111-4111-8111-111111111111", name: "Manali" },
      excerpt: "Manali jana hai",
    });
    expect(by["trip.when"]?.value).toEqual({ kind: "dates", from: "2026-12-15", to: "2026-12-20" });
    expect(by["trip.adults"]?.value).toBe(4);
    expect(by["trip.childrenAges"]?.value).toEqual([5, 9]);
    expect(by["trip.budget"]).toMatchObject({
      value: { amount: { amountPaise: 10_000_000, currency: "INR" }, basis: "for_everyone" },
      excerpt: "1 lakh tak",
    });
    expect(by["trip.tripType"]?.value).toBe("family");
    expect(by["trip.hotelCategory"]?.value).toBe("4_star");
    expect(questions).toEqual([]);
  });

  it("proposes a new destination for the person to confirm, and a month when only the start day is known", async () => {
    const { fields, questions } = await resolveLead(
      lead({ name: "Asha", phone: "9876543210", destination: "Spiti", dateFrom: "kal" }),
      "lead",
      context,
    );
    expect(fields.find((field) => field.path === "trip.destination")?.value).toEqual({ kind: "new", name: "Spiti" });
    expect(fields.find((field) => field.path === "trip.when")?.value).toEqual({ kind: "month", month: "2026-10" });
    expect(questions).toContain("What are the travel dates, start and end?");
  });

  it("asks instead of guessing: children without ages, a budget it cannot read, dates it cannot read, a bad phone", async () => {
    const { fields, questions } = await resolveLead(
      lead({ name: "Asha", phone: "12345", childrenCount: 2, budget: "kuch bhi", dateFrom: "someday" }),
      "lead",
      context,
    );
    expect(fields.map((field) => field.path)).toEqual(["person.name"]);
    expect(questions).toEqual(
      expect.arrayContaining([
        "The phone number didn't look right: what is it?",
        "How old are the children?",
        "What is the budget, in rupees?",
        "Which dates or which month are they travelling?",
      ]),
    );
  });

  it("puts a second number in the note, not in the lead's phone", async () => {
    const { fields } = await resolveLead(
      lead({ name: "Asha", phone: "9876543210", phone2: "9123456780", note: "Wants a quiet place" }),
      "lead",
      context,
    );
    expect(fields.find((field) => field.path === "person.phone")?.value).toBe("+919876543210");
    expect(fields.find((field) => field.path === "note")?.value).toBe(
      "Wants a quiet place\nSecond number: +919123456780",
    );
  });

  it("fills a lead edit with trip fields only, whatever else the model sent", async () => {
    const { fields } = await resolveLead(
      tripAnswer.parse({ name: "Ignored", adults: 3, roomType: "Twin" }),
      "lead_edit",
      context,
    );
    expect(fields.map((field) => field.path)).toEqual(["trip.adults", "trip.roomType"]);
  });

  it("ignores any money the model sends: there is no key and no path for a price", async () => {
    const { fields } = await resolveLead(
      lead({
        name: "Asha",
        phone: "9876543210",
        price: 5000,
        total: "₹5,000",
        gst: 18,
        paymentAmount: 100,
        bookingStatus: "confirmed",
      }),
      "lead",
      context,
    );
    expect(JSON.stringify(fields)).not.toMatch(/5000|gst|payment|booking/i);
  });
});

describe("a call note from words", () => {
  const call = (json: object) => callAnswer.parse(json);
  it("fills the outcome, the cleaned note and a follow-up with a real date", async () => {
    const { fields, questions } = await resolveCall(
      call({
        outcome: "spoke",
        note: "Rahul wants Manali, 4 adults.",
        followUpDay: "kal",
        followUpTime: "shaam 5 baje",
        followUpTitle: "Send the quote",
        adults: 4,
        excerpts: { followUpDay: "kal shaam 5 baje" },
      }),
      context,
    );
    expect(fields.find((field) => field.path === "call.outcome")?.value).toBe("spoke");
    expect(fields.find((field) => field.path === "call.followUp")).toMatchObject({
      value: { due: { on: "2026-10-31", at: "17:00" }, title: "Send the quote" },
      excerpt: "kal shaam 5 baje",
    });
    expect(fields.find((field) => field.path === "trip.adults")?.value).toBe(4);
    expect(questions).toEqual([]);
  });

  it("drops a follow-up in the past and asks about it, and fills only the outcome for no answer", async () => {
    const past = await resolveCall(
      call({ outcome: "spoke", followUpDay: "2026-10-01", followUpTime: "5 pm" }),
      context,
    );
    expect(past.fields.map((field) => field.path)).toEqual(["call.outcome"]);
    expect(past.questions).toEqual(["Which day is the follow-up?"]);
    const none = await resolveCall(call({ outcome: "no_answer" }), context);
    expect(none.fields.map((field) => field.path)).toEqual(["call.outcome"]);
  });
});

describe("a quote from words", () => {
  it("fills the text of a quote and leaves every price empty", () => {
    const { fields } = resolveQuote(
      quoteAnswer.parse({
        title: "Manali 5N/6D",
        startDate: "15 Dec",
        adults: 4,
        children: 0,
        days: [{ title: "Arrive", description: "Pickup from Chandigarh" }, { title: "" }],
        items: [{ description: "Hotel, 5 nights", quantity: 2, unitPricePaise: 900000, price: "9000" }],
        inclusions: "Breakfast",
        excerpts: { title: "Manali plan" },
      }),
      context,
    );
    const by = Object.fromEntries(fields.map((field) => [field.path, field.value]));
    expect(by["quote.startDate"]).toBe("2026-12-15");
    expect(by["quote.days"]).toEqual([{ title: "Arrive", description: "Pickup from Chandigarh" }]);
    expect(by["quote.items"]).toEqual([{ description: "Hotel, 5 nights", detail: "", quantity: 2 }]);
    expect(JSON.stringify(fields)).not.toMatch(/9000|price/i);
  });
});
