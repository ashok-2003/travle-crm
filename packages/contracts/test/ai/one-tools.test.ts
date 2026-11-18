// The one agent's tools: natural's fourteen with book on the terms alone, b2b hand-overs, its trace and its test input.
import { describe, expect, it } from "vitest";
import { naturalTestAnswer, naturalDryAction } from "../../src/ai/natural-try-it.js";
import { parseToolArguments } from "../../src/ai/natural-tools.js";
import { naturalTrace } from "../../src/ai/natural-trace.js";
import { oneReadTools, oneToolSchemas, parseOneToolArguments } from "../../src/ai/one-tools.js";
import { oneTestInput } from "../../src/ai/one-try-it.js";
import { z } from "zod";

const labels = ["T1", "T2"];
const handOver = { reason: "b2b", summary: "A travel agent asking for net rates." };
const book = { trip_id: "T1", date: "2026-12-19", adults: 2 };
const input = {
  messages: [{ from: "customer", text: "Kedarkantha 19 Dec, 2 log" }],
  state: null,
};
const trace = {
  agent: "one",
  promptVersion: "langfuse:whatsapp-agent/real-agent@3",
  promptLabel: "production",
  outcome: "replied",
  fallback: null,
  restarted: null,
  durationMs: 900,
  calls: [],
  guards: [],
  staged: [],
  flags: [],
};

describe("the one agent's tool schemas", () => {
  it("offers natural's fourteen tools, without the trip tools when the agency has no trips", () => {
    expect(oneToolSchemas({ tripLabels: labels, brochureLabels: ["B1"] })).toHaveLength(14);
    expect(oneToolSchemas({ tripLabels: [] }).map((tool) => tool.name)).toEqual([
      "update_lead",
      "resend_payment",
      "plan_follow_up",
      "create_task",
      "add_note",
      "hand_over",
      "suggest_close",
      "stay_quiet",
    ]);
  });

  it("books on the terms alone: full_name and customer_words are refused as unknown keys", () => {
    expect(parseOneToolArguments("book", book, labels).ok).toBe(true);
    for (const extra of [{ full_name: "Rohan Mehta" }, { customer_words: "haan" }]) {
      expect(parseOneToolArguments("book", { ...book, ...extra }, labels).ok).toBe(false);
    }
  });

  it("hands over for b2b, which natural's own parse still refuses", () => {
    expect(parseOneToolArguments("hand_over", handOver, labels)).toMatchObject({ ok: true });
    expect(parseToolArguments("hand_over", handOver, labels).ok).toBe(false);
  });

  it("names the trips in the refusal of an unknown trip_id", () => {
    expect(parseOneToolArguments("book", { ...book, trip_id: "T9" }, labels)).toEqual({
      ok: false,
      problem: "T9 isn't one of the trips; the trips are T1, T2",
    });
  });

  it("keeps the parse-only checks on the schemas it hands over", () => {
    const update = oneToolSchemas({ tripLabels: labels }).find((tool) => tool.name === "update_lead");
    expect(update?.schema.safeParse({}).success).toBe(false);
    expect(update?.schema.safeParse({ trip_id: "T1" }).success).toBe(true);
    expect(update?.schema.safeParse({ trip_id: "T9" }).success).toBe(false);
  });

  it("sends a brochure by its label, and refuses one that isn't listed", () => {
    const brochureLabels = ["B1", "B2"];
    expect(parseOneToolArguments("send_brochure", { brochure_id: "B2" }, labels, { brochureLabels })).toMatchObject({
      ok: true,
    });
    expect(parseOneToolArguments("send_brochure", { brochure_id: "B7" }, labels, { brochureLabels })).toEqual({
      ok: false,
      problem: "B7 isn't one of the brochures; the brochures are B1, B2",
    });
    expect(parseOneToolArguments("send_brochure", { trip_id: "T1" }, labels, { brochureLabels }).ok).toBe(false);
    const offered = oneToolSchemas({ tripLabels: labels, brochureLabels });
    const schema = offered.find((tool) => tool.name === "send_brochure")?.schema;
    if (schema === undefined) throw new Error("send_brochure is offered");
    expect(JSON.stringify(z.toJSONSchema(schema, { io: "input" }))).toContain('"enum":["B1","B2"]');
    expect(schema.safeParse({ brochure_id: "B3" }).success).toBe(false);
    // With no brochures it isn't offered; natural's own tool still takes a trip.
    expect(oneToolSchemas({ tripLabels: labels }).map((tool) => tool.name)).not.toContain("send_brochure");
    expect(parseToolArguments("send_brochure", { trip_id: "T1" }, labels).ok).toBe(true);
  });

  it("offers transcribe_voice_note and look_at_image only for the turn's own references", () => {
    const names = (more: { voiceNotes?: string[]; photos?: string[] }) =>
      oneToolSchemas({ tripLabels: labels, ...more }).map((tool) => tool.name);
    expect(names({})).not.toContain("transcribe_voice_note");
    expect(names({})).not.toContain("look_at_image");
    expect(names({ voiceNotes: ["m3"] })).toContain("transcribe_voice_note");
    expect(names({ voiceNotes: ["m3"] })).not.toContain("look_at_image");
    const look = oneToolSchemas({ tripLabels: labels, photos: ["m7"] }).find((tool) => tool.name === "look_at_image");
    expect(look?.schema.safeParse({ message: "m7", question: "the amount?" }).success).toBe(true);
    expect(look?.schema.safeParse({ message: "m7", question: "" }).success).toBe(false);
    expect(oneReadTools).toEqual(expect.arrayContaining(["quote", "transcribe_voice_note", "look_at_image"]));
    const more = { voiceNotes: ["m3"], photos: ["m7"] };
    expect(parseOneToolArguments("look_at_image", { message: "m7" }, labels, more)).toMatchObject({ ok: true });
    expect(parseOneToolArguments("look_at_image", { message: "m3" }, labels, more).ok).toBe(false);
    expect(parseOneToolArguments("transcribe_voice_note", '{"message":"m3"}', labels, more).ok).toBe(true);
    expect(parseOneToolArguments("transcribe_voice_note", { message: "m3", extra: 1 }, labels, more).ok).toBe(false);
    expect(parseOneToolArguments("transcribe_voice_note", { message: "m9" }, labels, more)).toEqual({
      ok: false,
      problem: "m9 isn't one of this chat's voice notes; m3",
    });
  });

  it("offers the same media tools in every chat, whatever its references, so an agency's chats share one cache", () => {
    const schemas = (more: { voiceNotes: string[]; photos: string[] }) =>
      JSON.stringify(
        oneToolSchemas({ tripLabels: labels, ...more }).map((tool) => z.toJSONSchema(tool.schema, { io: "input" })),
      );
    const one = schemas({ voiceNotes: ["m3"], photos: ["m7"] });
    expect(one).toBe(schemas({ voiceNotes: ["m1", "m2"], photos: ["m9"] }));
    expect(one).toContain("The message's reference, like m1.");
    expect(one).not.toContain('"enum":["m3"]');
  });

  it("describes book with no customer words in its JSON Schema", () => {
    const schema = oneToolSchemas({ tripLabels: labels }).find((tool) => tool.name === "book")?.schema;
    if (schema === undefined) throw new Error("book is offered");
    const json = JSON.stringify(z.toJSONSchema(schema, { io: "input" }));
    expect(json).not.toContain("customer_words");
    expect(json).not.toContain("full_name");
    expect(json).toContain('"enum":["T1","T2"]');
  });
});

describe("the one agent's trace, dry actions and test input", () => {
  it("reads a trace of the one agent", () => {
    expect(naturalTrace.parse(trace).agent).toBe("one");
    expect(naturalTrace.safeParse({ ...trace, agent: "lite" }).success).toBe(false);
    expect(naturalTestAnswer.shape.trace.safeParse({ ...trace, agent: "natural", promptLabel: null }).success).toBe(
      true,
    );
  });

  it("reads a dry hand-over for b2b", () => {
    expect(naturalDryAction.parse({ tool: "hand_over", ...handOver }).tool).toBe("hand_over");
  });

  it("refuses a model, a temperature, a prompt choice and any unknown key in one's test input", () => {
    expect(oneTestInput.safeParse(input).success).toBe(true);
    expect(oneTestInput.safeParse({ ...input, prompt: "draft" }).success).toBe(false);
    expect(oneTestInput.safeParse({ ...input, extra: 1 }).success).toBe(false);
    expect(oneTestInput.safeParse({ ...input, temperature: "0.4" }).success).toBe(false);
    expect(oneTestInput.safeParse({ ...input, model: "flash" }).success).toBe(false);
  });

  it("takes a tap only as book or change", () => {
    expect(oneTestInput.safeParse({ ...input, tap: "book" }).success).toBe(true);
    expect(oneTestInput.safeParse({ ...input, tap: "change" }).success).toBe(true);
    expect(oneTestInput.safeParse({ ...input, tap: "cancel" }).success).toBe(false);
  });
});
