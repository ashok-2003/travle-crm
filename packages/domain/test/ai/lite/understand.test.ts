// The Understand call: one model call whose answer is the strict form, kept with its raw text, or why there is none.
import { liteFacts, understandForm } from "@travel-crm/contracts/ai";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { understandChat } from "../../../src/ai/lite/understand.js";
import { readLiteFacts, saveLiteFacts } from "../../../src/ai/lite/merge.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liteAgency } from "./support/lite-agency.js";

const request = {
  feature: "autopilot" as const,
  messages: [{ role: "user" as const, content: "x" }],
  schema: { name: "understand_form", jsonSchema: {} },
};
const form = {
  intents: [{ name: "hello", proof: "hi" }],
  details: {
    package: null,
    place: null,
    date: null,
    adults: null,
    children: null,
    name: null,
    pickup_city: null,
    room: null,
    pay_in_full: null,
  },
  open_to_other_trips: "unknown",
  lookups: [],
  language: "english",
  summary: "",
  score: { chance: 40, label: "warm", reasons: [], looks_fake: false, fake_why: "", standing: "", next_step: "" },
};

describe("understandChat", () => {
  it("returns the form, the raw text and the usage", async () => {
    const model = createMemoryAiModel();
    const text = JSON.stringify(form);
    model.answer(text);
    const understood = await understandChat(model, request);
    expect(understood).toEqual({
      ok: true,
      form: understandForm.parse(form),
      raw: text,
      usage: { model: "memory-model", inputTokens: 0, outputTokens: 0 },
    });
  });

  it("an answer that doesn't fit is unfit and keeps its raw text", async () => {
    const model = createMemoryAiModel();
    model.answer('{"intents": []}', { ok: false, reason: "rate_limited" });
    expect(await understandChat(model, request)).toEqual({
      ok: false,
      reason: "unfit",
      raw: '{"intents": []}',
      usage: { model: "memory-model", inputTokens: 0, outputTokens: 0 },
    });
    expect(await understandChat(model, request)).toEqual({ ok: false, reason: "rate_limited", raw: null });
  });
});

describe("the lite facts row", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("a grounded facts row reads as empty lite facts, and lite facts round-trip", async () => {
    const on = await liteAgency(test);
    // What the earlier grounded agent kept: facts with no `agent: "lite"` mark.
    await on.inOrg((tx) =>
      tx.aiChat.upsert({
        where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
        create: { conversationId: on.chat.id, facts: { pickupCity: "Mumbai", adults: 2 } },
        update: { facts: { pickupCity: "Mumbai", adults: 2 } },
      }),
    );
    expect(await on.inOrg((tx) => readLiteFacts(tx, on.chat.id))).toEqual(liteFacts.parse({ agent: "lite" }));
    const facts = liteFacts.parse({ agent: "lite", adults: 3, language: "hindi" });
    await on.inOrg((tx) => saveLiteFacts(tx, on.chat.id, facts));
    expect(await on.inOrg((tx) => readLiteFacts(tx, on.chat.id))).toEqual(facts);
  });
});
