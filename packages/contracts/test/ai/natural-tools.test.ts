// The natural agent's tools: which the model is offered each turn, their trip labels, and how a call is parsed.
import { describe, expect, it } from "vitest";
import { naturalToolDefinitions, parseToolArguments } from "../../src/ai/natural-tools.js";

const labels = ["T1", "T2"];

describe("the natural agent's tool definitions", () => {
  it("offers 14 tools with indexed trips and 12 with inline ones", () => {
    expect(naturalToolDefinitions({ tripLabels: labels, indexed: true })).toHaveLength(14);
    const inline = naturalToolDefinitions({ tripLabels: labels, indexed: false }).map((tool) => tool.name);
    expect(inline).toHaveLength(12);
    expect(inline).not.toEqual(expect.arrayContaining(["find_trips"]));
    expect(inline).not.toEqual(expect.arrayContaining(["get_trip"]));
  });

  it("enumerates the turn's trip labels in every trip_id", () => {
    const tools = naturalToolDefinitions({ tripLabels: labels, indexed: true });
    const quote = tools.find((tool) => tool.name === "quote");
    expect(quote?.parameters).toMatchObject({ properties: { trip_id: { enum: ["T1", "T2"] } } });
    const naming = tools.filter((tool) => JSON.stringify(tool.parameters).includes("trip_id"));
    expect(naming.map((tool) => tool.name)).toEqual([
      "get_trip",
      "quote",
      "update_lead",
      "send_brochure",
      "offer_booking",
      "book",
    ]);
    for (const tool of naming) {
      expect(tool.parameters).toMatchObject({ properties: { trip_id: { enum: ["T1", "T2"] } } });
    }
  });

  it("offers no tool that names a trip when there is none", () => {
    const tools = naturalToolDefinitions({ tripLabels: [], indexed: false });
    expect(tools.map((tool) => tool.name)).toEqual([
      "update_lead",
      "resend_payment",
      "plan_follow_up",
      "create_task",
      "add_note",
      "hand_over",
      "suggest_close",
      "stay_quiet",
    ]);
    expect(JSON.stringify(tools)).not.toContain("trip_id");
  });

  it("sends no examples keyword and no schema dialect to the model", () => {
    const wire = JSON.stringify(naturalToolDefinitions({ tripLabels: ["T1"], indexed: true }));
    expect(wire).not.toContain("examples");
    expect(wire).not.toContain("$schema");
  });

  it("leaves a defaulted argument optional", () => {
    const quote = naturalToolDefinitions({ tripLabels: labels, indexed: false }).find((tool) => tool.name === "quote");
    expect(quote?.parameters).toMatchObject({ required: ["trip_id", "date", "adults"], additionalProperties: false });
  });
});

describe("parsing a tool call", () => {
  it("parses arguments, and says what's wrong in a sentence", () => {
    expect(parseToolArguments("quote", '{"trip_id":"T1","date":"2026-12-12","adults":0}', labels)).toEqual({
      ok: false,
      problem: expect.stringContaining("adults") as unknown,
    });
    expect(parseToolArguments("quote", "not json", labels)).toEqual({
      ok: false,
      problem: "the arguments weren't JSON",
    });
    expect(parseToolArguments("fly", "{}", labels)).toEqual({ ok: false, problem: "there is no tool called fly" });
  });

  it("refuses a trip outside the turn's labels before anything else", () => {
    expect(parseToolArguments("quote", '{"trip_id":"T9"}', labels)).toEqual({
      ok: false,
      problem: "T9 isn't one of the trips; the trips are T1, T2",
    });
    expect(parseToolArguments("update_lead", { trip_id: "T1" }, [])).toEqual({
      ok: false,
      problem: "T1 isn't one of the trips; the agency has no trips listed",
    });
  });

  it("takes the arguments as JSON text or as an object, and fills the defaults", () => {
    const parsed = {
      ok: true,
      name: "quote",
      args: { trip_id: "T1", date: "2026-12-12", adults: 2, children_ages: [] },
    };
    expect(parseToolArguments("quote", '{"trip_id":"T1","date":"2026-12-12","adults":2}', labels)).toEqual(parsed);
    expect(parseToolArguments("quote", { trip_id: "T1", date: "2026-12-12", adults: 2 }, labels)).toEqual(parsed);
  });

  it("reads no text as no arguments, and refuses JSON that isn't an object", () => {
    expect(parseToolArguments("resend_payment", "", labels)).toEqual({ ok: true, name: "resend_payment", args: {} });
    expect(parseToolArguments("add_note", '["hi"]', labels)).toEqual({
      ok: false,
      problem: "the arguments weren't a JSON object",
    });
  });

  it("refuses an argument the tool doesn't take", () => {
    expect(parseToolArguments("add_note", { text: "Prefers a weekend", trip_id: "T1" }, labels)).toEqual({
      ok: false,
      problem: expect.stringContaining("trip_id") as unknown,
    });
  });

  it("refuses update_lead with nothing to save", () => {
    expect(parseToolArguments("update_lead", {}, labels)).toEqual({
      ok: false,
      problem: "give at least one detail the customer said",
    });
  });

  it("takes a follow-up's date only with on_date, and needs it there", () => {
    expect(parseToolArguments("plan_follow_up", { when: "on_date", about: "Dates for Jan" }, labels)).toEqual({
      ok: false,
      problem: "date: on_date needs a date",
    });
    expect(
      parseToolArguments("plan_follow_up", { when: "this_evening", date: "2026-12-12", about: "Price" }, labels),
    ).toEqual({ ok: false, problem: "date: give a date only with on_date" });
    expect(
      parseToolArguments("plan_follow_up", { when: "on_date", date: "2026-12-12", about: "Price" }, labels),
    ).toMatchObject({ ok: true });
  });

  it("takes a call-back time as a local date and time", () => {
    const task = { kind: "call_back", text: "Call about the Jan batch" };
    expect(parseToolArguments("create_task", { ...task, call_at: "2026-12-12T18:30" }, labels)).toMatchObject({
      ok: true,
    });
    expect(parseToolArguments("create_task", { ...task, call_at: "2026-12-12T18:30:00Z" }, labels)).toEqual({
      ok: false,
      problem: expect.stringContaining("call_at") as unknown,
    });
  });
});
