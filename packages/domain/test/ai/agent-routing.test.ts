// Which agent answers a customer: the one agent, for every agency, whatever an older ai_autopilot row still says (lite
// or natural, from before the owner's decision of 2026-11-24), and its follow-ups too. A server with no tool agent
// answers not_configured, with no model call.
import { createMemoryToolAgent } from "@travel-crm/integrations/tool-agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAgentTurn, type AgentDependencies } from "../../src/ai/agent.js";
import { createTestInbox, type TestInbox } from "../inbox/support.js";
import { liveAgency, liveAt, liveNow, type LiveAgency } from "./natural/support/live-agency.js";

const oneWords = "Haan! Kedarkantha har Saturday December mein, ₹9,499 per person.";

describe("routing a turn to the one agent", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const withToolAgent = (on: LiveAgency): AgentDependencies => ({
    ...on.dependencies(),
    toolAgent: createMemoryToolAgent(),
  });
  /** What an agency's row said before every agency moved to one; the migration rewrites it, the turn never reads it. */
  const rowSays = (on: LiveAgency, agent: "lite" | "natural") =>
    on.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { agent } }));

  it("runs the one turn, and its follow-ups", async () => {
    const on = await liveAgency(test);
    const dependencies = withToolAgent(on);
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

  it("runs the one turn for an agency whose row still says lite or natural", async () => {
    for (const agent of ["lite", "natural"] as const) {
      const on = await liveAgency(test);
      await rowSays(on, agent);
      // Without a tool agent the one turn answers nothing, where lite or natural would have asked the model.
      expect(await runAgentTurn(on.dependencies(), on.turnInput(), liveNow)).toBe("not_configured");
      expect(on.model.requests).toHaveLength(0);
      on.model.answer({ text: oneWords }, "");
      expect(await runAgentTurn(withToolAgent(on), on.turnInput(), liveNow)).toBe("replied");
    }
  });

  it("answers not_configured on a server with no tool agent", async () => {
    const on = await liveAgency(test);
    expect(await runAgentTurn(on.dependencies(), on.turnInput(), liveNow)).toBe("not_configured");
    expect(on.model.requests).toHaveLength(0);
  });
});
