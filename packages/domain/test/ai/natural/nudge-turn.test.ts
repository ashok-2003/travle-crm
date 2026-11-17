// The natural agent's follow-up turn (plan 2, Task 7) against the real database and the memory model: one call whose only
// tool is stay_quiet, in the agency's waking hours, at most two a silence, the silence counted from the last turn that ran
// (a quiet one included), a reply or a 👍 ends it, and the words pass the same guards as a reply's.
import { createMemoryTracing, notedTurn } from "@travel-crm/integrations/tracing";
import { withTracing } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runNaturalNudge } from "../../../src/ai/natural/nudge-turn.js";
import { runNaturalTurn } from "../../../src/ai/natural/turn.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liveAgency, liveAt, liveNow } from "./support/live-agency.js";

const FIRST_WORDS = "Kedarkantha runs every Saturday in December. Which date suits you?";
const NUDGE_WORDS = "Hi Rahul, Anita here. Did a date work out for Kedarkantha?";
const SECOND_WORDS = "Rahul, seats on the 19th are going. Want me to hold two for you?";
const planned = { name: "plan_follow_up", arguments: { when: "in_a_few_hours", about: "Ask which date suits them" } };

describe("the natural agent's follow-up turn", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world() {
    const on = await liveAgency(test);
    const tracing = createMemoryTracing();
    const dependencies = () => ({ ...on.dependencies(), ai: withTracing(on.model, tracing), tracing });
    const nudgeInput = (number: number) => ({
      organizationId: on.organizationId,
      conversationId: on.chat.id,
      kind: "nudge" as const,
      token: `nudge:${on.chat.id}:${String(number)}`,
    });
    const nudge = (number: number, at: Date) => runNaturalNudge(dependencies(), nudgeInput(number), at);
    const chatState = () => on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    const outbound = () =>
      on.inOrg((tx) =>
        tx.whatsappMessage.findMany({
          where: { conversationId: on.chat.id, direction: "out" },
          orderBy: { createdAt: "asc" },
          select: { clientToken: true, body: true, reaction: true },
        }),
      );
    /** The first reply turn: it answers the customer's line and plans a follow-up for a few hours on. */
    const replied = async (words = FIRST_WORDS) => {
      on.model.answer({ text: words, toolCalls: [planned] });
      expect(await runNaturalTurn(dependencies(), on.turnInput(), liveNow)).toBe("replied");
      const state = await chatState();
      return state.followUpAt ?? liveNow;
    };
    return { ...on, tracing, nudge, chatState, outbound, replied };
  }

  it("follows up once in the model's words, in waking hours", async () => {
    const on = await world();
    const due = await on.replied();
    on.model.answer(NUDGE_WORDS);
    expect(await on.nudge(1, due)).toBe("replied");
    const sent = await on.outbound();
    expect(sent.map((message) => [message.clientToken, message.body])).toEqual([
      [`ai:${on.message.id}`, FIRST_WORDS],
      [`ai:nudge:${on.chat.id}:1`, NUDGE_WORDS],
    ]);
    // It counts itself, plans the second, and the follow-up call said which one it is.
    expect(await on.chatState()).toMatchObject({ followUpsSent: 1, lastNudgeAt: due, lastReplyAt: due });
    const request = on.model.requests.at(-1);
    const turnBlock = request?.messages.at(-1)?.content ?? "";
    expect(turnBlock).toContain("follow-up 1 of 2");
    // Traced as the chat's follow-up.
    const turn = on.tracing.turns.at(-1);
    expect(turn?.start).toMatchObject({
      name: "whatsapp-agent.natural.follow-up",
      sessionId: `whatsapp:${on.chat.id}`,
      tags: ["whatsapp-agent", "natural", "follow-up"],
    });
    expect(turn === undefined ? null : notedTurn(turn)).toMatchObject({
      output: { role: "assistant", content: NUDGE_WORDS },
      statusMessage: "replied",
    });
  });

  it("sends no third follow-up", async () => {
    const on = await world();
    const first = await on.replied();
    on.model.answer(NUDGE_WORDS);
    expect(await on.nudge(1, first)).toBe("replied");
    const second = (await on.chatState()).followUpAt ?? liveNow;
    on.model.answer(SECOND_WORDS);
    expect(await on.nudge(2, second)).toBe("replied");
    const before = on.model.requests.length;
    on.model.answer("One more nudge");
    expect(await on.nudge(3, new Date(second.getTime() + 30 * 60_000))).toBe("nothing");
    expect(on.model.requests).toHaveLength(before);
    expect(await on.outbound()).toHaveLength(3);
  });

  it("offers the model no tool but stay_quiet", async () => {
    const on = await world();
    const due = await on.replied();
    on.model.answer(NUDGE_WORDS);
    await on.nudge(1, due);
    const tools = on.model.requests.at(-1)?.tools ?? [];
    expect(tools.map((tool) => tool.name)).toEqual(["stay_quiet"]);
  });

  it("stays quiet when the model calls stay_quiet, and sends nothing", async () => {
    const on = await world();
    const due = await on.replied();
    on.model.answer({
      toolCalls: [{ name: "stay_quiet", arguments: { reason: "They said they'd decide by Sunday" } }],
    });
    expect(await on.nudge(1, due)).toBe("quiet");
    expect(await on.outbound()).toHaveLength(1);
    // A quiet follow-up ends the follow-ups: nothing is planned again.
    expect(await on.chatState()).toMatchObject({ followUpAt: null });
  });

  it("goes only in waking hours", async () => {
    const on = await world();
    await on.replied();
    const before = on.model.requests.length;
    // 02:00 on the agency's clock, 21 November.
    on.model.answer(NUDGE_WORDS);
    expect(await on.nudge(1, new Date("2026-11-20T20:30:00Z"))).toBe("night");
    expect(on.model.requests).toHaveLength(before);
    expect(await on.outbound()).toHaveLength(1);
  });

  it("stops when the customer wrote since", async () => {
    const on = await world();
    const due = await on.replied();
    await on.write({ direction: "in", at: liveAt(300), body: "Which date is best?" });
    const before = on.model.requests.length;
    on.model.answer(NUDGE_WORDS);
    expect(await on.nudge(1, due)).toBe("answered");
    expect(on.model.requests).toHaveLength(before);
  });

  it("treats a 👍 reaction as an answer and sends nothing", async () => {
    const on = await world();
    const due = await on.replied();
    await on.inOrg((tx) =>
      tx.whatsappMessage.updateMany({
        where: { conversationId: on.chat.id, clientToken: `ai:${on.message.id}` },
        data: { reaction: "👍" },
      }),
    );
    const before = on.model.requests.length;
    on.model.answer(NUDGE_WORDS);
    expect(await on.nudge(1, due)).toBe("answered");
    expect(on.model.requests).toHaveLength(before);
    expect(await on.outbound()).toHaveLength(1);
  });

  it("counts the silence from the quiet turn, so an 'ok' it chose not to answer does not end the follow-up", async () => {
    const on = await world();
    await on.replied();
    // "ok" after our reply: a quiet turn that plans a follow-up (Task 5 keeps the plan).
    const ok = await on.write({ direction: "in", at: liveAt(60), body: "ok" });
    on.model.answer({
      toolCalls: [
        { name: "stay_quiet", arguments: { reason: "acknowledged" } },
        { name: "plan_follow_up", arguments: { when: "in_a_few_hours", about: "Ask which date suits them" } },
      ],
    });
    expect(await runNaturalTurn({ ...on.dependencies(), ai: on.model }, on.turnInput(ok), liveAt(120))).toBe("quiet");
    const due = (await on.chatState()).followUpAt;
    expect(due).not.toBeNull();
    on.model.answer(NUDGE_WORDS);
    expect(await on.nudge(1, due ?? liveNow)).toBe("replied");
  });

  it("checks the words with the same guards", async () => {
    const on = await world();
    const due = await on.replied();
    const invented = "Rahul, Kedarkantha is only ₹4,111 per person this week!";
    // The guard asks for a rewrite once, then the follow-up is let go: no fallback line goes to a customer who was quiet.
    on.model.answer(invented, invented);
    expect(await on.nudge(1, due)).toBe("nothing");
    expect(await on.outbound()).toHaveLength(1);
  });
});
