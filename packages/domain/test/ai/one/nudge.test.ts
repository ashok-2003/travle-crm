// The one agent's follow-up against the real database, the memory model and the in-memory tool agent: natural's gates
// (at most two, waking hours), one run whose only tool is stay_quiet, nothing sent when the model fails or falls back,
// and one trace named for the follow-up.
import { withTracing } from "@travel-crm/integrations/ai";
import { createMemoryToolAgent } from "@travel-crm/integrations/tool-agent";
import { createMemoryTracing, notedTurn } from "@travel-crm/integrations/tracing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runOneNudge } from "../../../src/ai/one/nudge.js";
import { runOneTurn } from "../../../src/ai/one/turn.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liveAgency, liveNow } from "../natural/support/live-agency.js";

const FIRST_WORDS = "Kedarkantha har Saturday December mein hai. Kaunsi date theek rahegi?";
const NUDGE_WORDS = "Hi Rahul, Riya here. Kedarkantha ki date decide hui?";
const SECOND_WORDS = "Rahul, 19 Dec ki seats bhar rahi hain. Do hold kar doon?";
const planned = { name: "plan_follow_up", arguments: { when: "in_a_few_hours", about: "Ask which date suits them" } };

describe("the one agent's follow-up", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world() {
    const on = await liveAgency(test);
    const tracing = createMemoryTracing();
    const dependencies = () => ({
      ...on.dependencies(),
      ai: withTracing(on.model, tracing),
      tracing,
      toolAgent: createMemoryToolAgent(),
    });
    const nudge = (number: number, at: Date) =>
      runOneTurn(
        dependencies(),
        {
          organizationId: on.organizationId,
          conversationId: on.chat.id,
          kind: "nudge",
          token: `nudge:${on.chat.id}:${String(number)}`,
        },
        at,
      );
    const chatState = () => on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    const outbound = () =>
      on.inOrg((tx) =>
        tx.whatsappMessage.findMany({
          where: { conversationId: on.chat.id, direction: "out" },
          orderBy: { createdAt: "asc" },
          select: { body: true },
        }),
      );
    /** The first reply turn: it answers the customer's line and plans a follow-up a few hours on; when it's due. */
    const replied = async () => {
      on.model.answer({ text: FIRST_WORDS, toolCalls: [planned] }, "");
      expect(await runOneTurn(dependencies(), on.turnInput(), liveNow)).toBe("replied");
      return (await chatState()).followUpAt ?? liveNow;
    };
    return { ...on, tracing, nudge, chatState, outbound, replied, dependencies };
  }

  it("follows up with stay_quiet as its only tool, at most twice, never at night", async () => {
    const on = await world();
    const first = await on.replied();
    on.model.answer(NUDGE_WORDS);
    expect(await on.nudge(1, first)).toBe("replied");
    const request = on.model.requests.at(-1);
    expect((request?.tools ?? []).map((tool) => tool.name)).toEqual(["stay_quiet"]);
    expect(request?.messages.at(-1)?.content).toContain("follow-up 1 of 2");
    const second = (await on.chatState()).followUpAt ?? liveNow;
    on.model.answer(SECOND_WORDS);
    expect(await on.nudge(2, second)).toBe("replied");
    const before = on.model.requests.length;
    on.model.answer("One more nudge");
    expect(await on.nudge(3, new Date(second.getTime() + 30 * 60_000))).toBe("nothing");
    expect(on.model.requests).toHaveLength(before);
    expect((await on.outbound()).map((message) => message.body)).toEqual([FIRST_WORDS, NUDGE_WORDS, SECOND_WORDS]);

    // 02:00 on the agency's clock, 21 November: no call.
    const night = await world();
    await night.replied();
    const calls = night.model.requests.length;
    night.model.answer(NUDGE_WORDS);
    expect(await night.nudge(1, new Date("2026-11-20T20:30:00Z"))).toBe("night");
    expect(night.model.requests).toHaveLength(calls);
  });

  it("sends nothing when the model fails or falls back", async () => {
    const on = await world();
    const due = await on.replied();
    on.model.answer({ ok: false, reason: "unavailable" });
    expect(await on.nudge(1, due)).toBe("nothing");
    // No words twice: the fallback, which a follow-up never sends.
    on.model.answer("", "");
    expect(await on.nudge(1, due)).toBe("nothing");
    expect((await on.outbound()).map((message) => message.body)).toEqual([FIRST_WORDS]);
    expect((await on.chatState()).followUpsSent).toBe(0);
  });

  it("traces it as whatsapp-agent.one.follow-up", async () => {
    const on = await world();
    const due = await on.replied();
    on.model.answer(NUDGE_WORDS);
    expect(await runOneNudge(on.dependencies(), { ...on.turnInput(), kind: "nudge", token: "nudge:1" }, due)).toBe(
      "replied",
    );
    const turn = on.tracing.turns.at(-1);
    expect(turn?.start).toMatchObject({
      name: "whatsapp-agent.one.follow-up",
      sessionId: `whatsapp:${on.chat.id}`,
      tags: ["whatsapp-agent", "one", "follow-up"],
    });
    expect(turn === undefined ? null : notedTurn(turn)).toMatchObject({
      output: { role: "assistant", content: NUDGE_WORDS },
      statusMessage: "replied",
    });
  });
});
