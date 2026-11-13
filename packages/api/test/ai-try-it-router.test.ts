// ai.test on the real router is Try it for the one agent: the lite turn as a dry run, so its first model call is Understand.
import { saveAiSettings } from "@travel-crm/domain/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../src/context.js";
import { anAgency, callerOf, createHarness, type Harness } from "./forms-support.js";

const details = {
  package: null,
  place: null,
  date: null,
  adults: null,
  children: null,
  name: null,
  pickup_city: null,
  room: null,
  pay_in_full: null,
};
const understood = JSON.stringify({
  intents: [{ name: "hello", proof: "hi" }],
  details,
  open_to_other_trips: "unknown",
  lookups: [],
  language: "english",
  summary: "Said hello.",
  score: {
    chance: 40,
    label: "warm",
    reasons: ["Said hello"],
    looks_fake: false,
    fake_why: "",
    standing: "Just started",
    next_step: "Share the trips",
  },
});

describe("ai.test", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  it("runs the lite dry run: the first model call is the Understand form", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "inbox", "ai"] });
    const schemas: (string | undefined)[] = [];
    const model: NonNullable<Context["ai"]> = {
      configured: true,
      complete: (request) => {
        schemas.push(request.schema?.name);
        return Promise.resolve({
          ok: true,
          text: understood,
          model: "memory-model",
          inputTokens: 10,
          outputTokens: 10,
        });
      },
    };
    const { caller, member } = callerOf(harness, { organizationId, context: { ai: model } });
    await harness.db.forOrg(organizationId, (tx) =>
      saveAiSettings(tx, member, { enabled: true, scoring: true }, { providerReady: true, now: new Date() }),
    );
    await caller.ai.test({ question: "hi" });
    expect(schemas[0]).toBe("understand_form");
  });
});
