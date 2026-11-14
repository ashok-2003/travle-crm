// Try it as a chat: each turn runs the lite turn on the whole test chat and the state the last turn left, so what one turn
// learned holds in the next; the agent's own lines count as sent, for the repeat check; and the trace says why.
import { liteFacts, testAiAnswer } from "@travel-crm/contracts/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { liteDryRun } from "../../../src/ai/index.js";
import { formatRupees } from "../../../src/kernel/index.js";
import { memberOf } from "../../imports/support/test-imports.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency } from "./support/lite-agency.js";
import { understood, written, type Agency } from "./support/turn-script.js";

type Chat = Parameters<typeof liteDryRun>[2];
type Line = Chat["messages"][number];

const customer = (text: string): Line => ({ from: "customer", text });
const agent = (text: string): Line => ({ from: "agent", text });
const kedarnath = { package: { name: "Kedarnath Yatra 4N", proof: "kedarnath", changed: false } };

/** The Understand answer with lookups of its own: `understood` asks for none. */
const withLookups = (answer: string, lookups: object[]) =>
  JSON.stringify({ ...(JSON.parse(answer) as object), lookups });

describe("Try it as a chat", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const turn = (on: Agency, messages: Line[], state: Chat["state"], choice: Partial<Chat> = {}) =>
    liteDryRun(
      { db: test.db, ai: on.model, agencyName: () => Promise.resolve("Sharma Holidays") },
      memberOf(on.organizationId, "org-owner"),
      { messages, state, ...choice },
      testNow,
    );

  it("carries the package picked in the first turn into the second", async () => {
    const on = await liteAgency(test);
    on.model.answer(
      understood([["package_question", "kedarnath"]], { details: kedarnath, summary: "Wants the Kedarnath yatra." }),
      written("It is a group yatra with a pickup. Do you have a month in mind?"),
    );
    const first = await turn(on, [customer("tell me about kedarnath")], null);
    expect(first.state.facts.packageId).toBe(on.packageId);
    expect(first.state.summary).toBe("Wants the Kedarnath yatra.");

    const priced = withLookups(understood([["price_question", "how much"]], { summary: "Asked the price." }), [
      { tool: "dates_and_seats", words: null, package: "Kedarnath Yatra 4N", month: null, topic: null },
    ]);
    on.model.answer(priced, written("Which city will you join us from?"));
    const chat = [customer("tell me about kedarnath"), agent(first.answer), customer("how much is it?")];
    const second = await turn(on, chat, first.state);

    // Nothing in the second line names the trip: the price is for the package the first turn picked.
    expect(second.answer).toContain(formatRupees(599_900));
    expect(second.state.facts.packageId).toBe(on.packageId);
    expect(second.state.summary).toBe("Asked the price.");
    // The second Understand read the first turn's summary.
    expect(JSON.stringify(on.model.requests[2]?.messages)).toContain("Wants the Kedarnath yatra.");
    expect(second.trace).toMatchObject({
      intents: ["price_question"],
      move: "give_price",
      writes: [{ answer: written("Which city will you join us from?"), refused: null }],
      handOver: null,
    });
    expect(second.trace.why).not.toBeNull();
    expect(second.trace.lookups.map((one) => one.request.tool)).toEqual(["dates_and_seats"]);
    // What the api's output schema lets through, lookups' results and all.
    expect(testAiAnswer.safeParse(second).success).toBe(true);
  });

  it("reads only the customer's lines after the agent's last as the burst", async () => {
    const on = await liteAgency(test);
    // "book" is said before the agent's last line: wanting to book needs words since then, so it is only history.
    on.model.answer(understood([["wants_to_book", "book kedarnath"]], { details: kedarnath }), written("Sure."));
    const shown = await turn(on, [customer("book kedarnath"), agent("Which month suits you?"), customer("ok")], null);
    expect(shown.trace.intents).not.toContain("wants_to_book");
  });

  it("refuses a reply that repeats the agent's own line, and keeps the state it was given", async () => {
    const on = await liteAgency(test);
    const said = "It is a group yatra with a pickup. Do you have a month in mind?";
    const state = { facts: liteFacts.parse({ agent: "lite", language: "english" }), summary: "Said hello." };
    on.model.answer(
      understood([["package_question", "kedarnath"]], { details: kedarnath }),
      written(said),
      written(said),
    );
    const shown = await turn(on, [customer("hi"), agent(said), customer("tell me about kedarnath")], state);
    expect(shown.dryRun).toEqual({ actions: [], blocked: "repeat" });
    expect(shown.trace.writes).toEqual([
      { answer: written(said), refused: "repeat" },
      { answer: written(said), refused: "repeat" },
    ]);
    expect(shown.state).toEqual(state);
  });

  it("asks the model and temperature the test chat chose, for Understand and Write alike, and names who answered", async () => {
    const on = await liteAgency(test);
    on.model.answer(
      understood([["package_question", "kedarnath"]], { details: kedarnath }),
      written("It is a group yatra with a pickup. Do you have a month in mind?"),
    );
    const shown = await turn(on, [customer("tell me about kedarnath")], null, { model: "x/flash", temperature: 0.4 });
    expect(on.model.requests.map((request) => [request.schema?.name, request.model, request.temperature])).toEqual([
      ["understand_form", "x/flash", 0.4],
      ["write_move", "x/flash", 0.4],
    ]);
    expect(shown.trace.model).toBe("memory-model");
  });

  it("names no model or temperature when the chat chose none, as the live turn never does", async () => {
    const on = await liteAgency(test);
    on.model.answer(understood([["discount", "discount"]]));
    await turn(on, [customer("any discount?")], null);
    expect(on.model.requests[0]).not.toHaveProperty("model");
    expect(on.model.requests[0]).not.toHaveProperty("temperature");
  });

  it("names a hand-over's reason in the trace", async () => {
    const on = await liteAgency(test);
    on.model.answer(understood([["discount", "discount"]]));
    const shown = await turn(on, [customer("any discount?")], null);
    expect(shown.handoff).toBe(true);
    expect(shown.trace).toMatchObject({ move: "hand_over", handOver: "discount", writes: [] });
  });
});
