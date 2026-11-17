// Which agent answers a customer (plan 2, Task 6): the agent the console chose for the agency, read again at every turn
// in the pause's transaction, so a change applies to the next message; lite where nothing chose natural. A chat the
// natural agent answered gives lite fresh facts when the agency is moved back, and back again no brochure goes twice.
import { liteFacts } from "@travel-crm/contracts/ai";
import { createMemoryToolAgent } from "@travel-crm/integrations/tool-agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAgentTurn, type AgentDependencies } from "../../src/ai/agent.js";
import { setAgent } from "../../src/ai/agent-choice.js";
import { systemActor } from "../../src/kernel/index.js";
import { createTestInbox, type TestInbox } from "../inbox/support.js";
import { liteAgency } from "./lite/support/lite-agency.js";
import { greeting, understood, written } from "./lite/support/turn-script.js";
import { liveAgency, liveAt, liveNow, type LiveAgency } from "./natural/support/live-agency.js";

const oneWords = "Haan! Kedarkantha har Saturday December mein, ₹9,499 per person.";
const priceWords = "Yes! Kedarkantha runs every Saturday in December, ₹9,499 per person in a triple tent.";
/** Lite's two calls for a hello: Understand, then Write. */
const liteHello = [understood([["hello", "Hi"]]), written(greeting)];

describe("routing a turn by the agency's agent", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const agentTurn = (on: LiveAgency, token: string, at: Date) => {
    const dependencies: AgentDependencies = on.dependencies();
    return runAgentTurn(dependencies, on.turnInput(token), at);
  };
  const choose = (on: LiveAgency, agent: "lite" | "natural" | "one") =>
    on.inOrg((tx) => setAgent(tx, systemActor(on.organizationId), agent));
  /** Lite's first call asks for its Understand form; the natural agent's offers tools. */
  const agentOf = (request: { schema?: { name: string }; tools?: readonly unknown[] } | undefined) =>
    request?.schema?.name === "understand_form" ? "lite" : request?.tools !== undefined ? "natural" : "none";
  const factsOf = async (on: LiveAgency) =>
    (await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }))).facts;

  it("answers a customer through the natural turn when the agency's agent is natural, and lite otherwise", async () => {
    const natural = await liveAgency(test);
    natural.model.answer({ text: priceWords });
    expect(await agentTurn(natural, natural.message.id, liveNow)).toBe("replied");
    expect(natural.model.requests.map(agentOf)).toEqual(["natural"]);

    const lite = await liteAgency(test);
    lite.model.answer(...liteHello);
    expect(await lite.turn()).toBe("replied");
    expect(lite.model.requests.map(agentOf)).toEqual(["lite", "none"]);
  });

  it("reads the agent at every turn, so a change applies to the next message", async () => {
    const on = await liveAgency(test);
    await choose(on, "lite");
    on.model.answer(...liteHello);
    expect(await agentTurn(on, on.message.id, liveNow)).toBe("replied");
    expect(on.model.requests.map(agentOf)).toEqual(["lite", "none"]);

    await choose(on, "natural");
    const next = await on.write({ direction: "in", at: liveAt(60), body: "Kedarkantha ka rate?" });
    on.model.answer({ text: priceWords });
    expect(await agentTurn(on, next, liveAt(120))).toBe("replied");
    expect(on.model.requests.map(agentOf).slice(2)).toEqual(["natural"]);
  });

  it("lets lite, switched back, start fresh facts on a chat the natural agent answered", async () => {
    const on = await liveAgency(test);
    on.model.answer({
      text: "Here's the Kedarkantha brochure.",
      toolCalls: [{ name: "send_brochure", arguments: { trip_id: "T1" } }],
    });
    expect(await agentTurn(on, on.message.id, liveNow)).toBe("replied");
    expect(await factsOf(on)).toMatchObject({ agent: "natural", sentTripIds: [on.kedarkantha] });

    await choose(on, "lite");
    const hello = await on.write({ direction: "in", at: liveAt(60), body: "Hi" });
    on.model.answer(...liteHello);
    expect(await agentTurn(on, hello, liveAt(120))).toBe("replied");
    expect(liteFacts.safeParse(await factsOf(on)).success).toBe(true);

    // Back on the natural agent, the brochure it sent before the switch is still sent: it doesn't go again.
    await choose(on, "natural");
    const again = await on.write({ direction: "in", at: liveAt(180), body: "Kedarkantha brochure bhejo" });
    on.model.answer(
      { toolCalls: [{ name: "send_brochure", arguments: { trip_id: "T1" } }] },
      { text: "Kedarkantha ka brochure upar bheja hai." },
    );
    expect(await agentTurn(on, again, liveAt(240))).toBe("replied");
    const files = await on.inOrg((tx) =>
      tx.whatsappMessage.count({ where: { conversationId: on.chat.id, clientToken: { endsWith: ":f1" } } }),
    );
    expect(files).toBe(1);
    expect(await factsOf(on)).toMatchObject({ agent: "natural", sentTripIds: [on.kedarkantha] });
  });
  it("routes an agency on one to the one turn, and its follow-ups", async () => {
    const on = await liveAgency(test);
    await choose(on, "one");
    const dependencies: AgentDependencies = { ...on.dependencies(), toolAgent: createMemoryToolAgent() };
    on.model.answer(
      { text: oneWords, toolCalls: [{ name: "plan_follow_up", arguments: { when: "in_a_few_hours", about: "Date" } }] },
      "",
    );
    expect(await runAgentTurn(dependencies, on.turnInput(), liveNow)).toBe("replied");
    const due = (await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } })))
      .followUpAt;
    on.model.answer("Rahul, kaunsi date theek rahegi?");
    const nudge = { ...on.turnInput(`nudge:${on.chat.id}:1`), kind: "nudge" as const };
    expect(await runAgentTurn(dependencies, nudge, due ?? liveAt(3 * 3600))).toBe("replied");
    expect(on.model.requests.at(-1)?.tools?.map((tool) => tool.name)).toEqual(["stay_quiet"]);
  });

  it("answers not_configured for one on a server with no tool agent", async () => {
    const on = await liveAgency(test);
    await choose(on, "one");
    expect(await agentTurn(on, on.message.id, liveNow)).toBe("not_configured");
    expect(on.model.requests).toHaveLength(0);
  });
});
