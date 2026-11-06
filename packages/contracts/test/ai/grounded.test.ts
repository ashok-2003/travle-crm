// chatFacts: every field has a default, so an empty object parses, and stored rooms keep working when a key is added later.
import { describe, expect, it } from "vitest";
import {
  chatFacts,
  readAnswer,
  readAnswerJsonSchema,
  writeAnswer,
  writeAnswerJsonSchema,
} from "../../src/ai/grounded.js";

describe("chatFacts", () => {
  it("parses {} to the empty facts", () => {
    expect(chatFacts.parse({})).toEqual({
      places: [],
      notRun: [],
      startsOn: null,
      month: null,
      rooms: [],
      travellers: null,
      budgetPaise: null,
      pickupCity: null,
      packageId: null,
      departureId: null,
      sentFileIds: [],
      paymentSentFor: null,
      bookingId: null,
    });
  });

  it("reads a stored room with an extra key instead of refusing the row", () => {
    const facts = chatFacts.parse({ rooms: [{ roomType: "double", people: 2, note: "new" }] });
    expect(facts.rooms).toEqual([{ roomType: "double", people: 2 }]);
  });

  it("refuses a bad month or date", () => {
    expect(chatFacts.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(chatFacts.safeParse({ startsOn: "tomorrow" }).success).toBe(false);
  });

  it("keeps travellers a positive count and the budget a non-negative whole number", () => {
    expect(chatFacts.safeParse({ travellers: 0 }).success).toBe(false);
    expect(chatFacts.safeParse({ travellers: 2.5 }).success).toBe(false);
    expect(chatFacts.safeParse({ budgetPaise: -1 }).success).toBe(false);
    expect(chatFacts.safeParse({ travellers: 2, budgetPaise: 0 }).success).toBe(true);
  });
});

describe("readAnswer", () => {
  const minimal = {
    places: [],
    startsOn: null,
    rooms: [],
    travellers: null,
    budgetRupees: null,
    pickupCity: null,
    chosen: null,
    wants: "information",
    wantsEvidence: "",
    special: null,
    nearest: [],
  };

  it("fits a bare answer, and refuses bad bounds and an unknown wish", () => {
    expect(readAnswer.safeParse(minimal).success).toBe(true);
    expect(readAnswer.safeParse({ ...minimal, wants: "refund" }).success).toBe(false);
    expect(readAnswer.safeParse({ ...minimal, nearest: ["S1", "S2", "S3", "S4"] }).success).toBe(false);
    expect(readAnswer.safeParse({ ...minimal, travellers: { count: 41, evidence: "41" } }).success).toBe(false);
    expect(readAnswer.safeParse({ ...minimal, rooms: [{ type: "double", count: 7, evidence: "x" }] }).success).toBe(
      false,
    );
  });

  it("has a JSON schema for the model", () => {
    expect(readAnswerJsonSchema).toMatchObject({ type: "object" });
  });
});

describe("writeAnswer", () => {
  const actions = {
    sendFiles: ["P1"],
    sendAgencyFiles: false,
    sendPayment: false,
    requestBooking: false,
    flag: null,
    handOver: null,
    note: null,
    task: { title: "Call back", dueInHours: 24 },
  };
  it("takes a reply of 1 to 1000 characters and the actions", () => {
    expect(writeAnswer.safeParse({ reply: "Hi", actions }).success).toBe(true);
    expect(writeAnswer.safeParse({ reply: "", actions }).success).toBe(false);
    expect(writeAnswer.safeParse({ reply: "x".repeat(1001), actions }).success).toBe(false);
    expect(
      writeAnswer.safeParse({ reply: "Hi", actions: { ...actions, task: { title: "t", dueInHours: 169 } } }).success,
    ).toBe(false);
    expect(
      writeAnswer.safeParse({ reply: "Hi", actions: { ...actions, task: { title: "t", dueInHours: 0 } } }).success,
    ).toBe(false);
  });
  it("has a JSON schema for the model", () => {
    expect(writeAnswerJsonSchema).toMatchObject({ type: "object" });
  });
});
