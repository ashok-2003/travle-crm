// The WhatsApp agent's turns as traces: a reply, a follow-up and a Try it turn are each one traced turn of their chat, with
// what the customer wrote in, what went out (or why nothing did) out, both model calls inside, and the whole lite trace,
// noted by the sink in the turn's own async context, as metadata. Tracing changes nothing the turn does.
import { createMemoryTracing, notedTurn, type MemoryTracing } from "@travel-crm/integrations/tracing";
import { withTracing } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tryItTurn } from "../../../src/ai/index.js";
import type { LiteTrace } from "../../../src/ai/lite/types.js";
import type { Entitlements } from "../../../src/subscriptions/index.js";
import { memberOf } from "../../imports/support/test-imports.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteEntitlements, liteTurnAt } from "./support/lite-agency.js";
import { greeting, outbound, understood, written } from "./support/turn-script.js";

const shown = (tracing: MemoryTracing, index = 0) => {
  const turn = tracing.turns[index];
  return turn === undefined ? null : notedTurn(turn);
};

describe("the agent's turns as traces", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("a reply is one turn of its chat: the customer's words in, the reply out, both calls and the whole turn inside", async () => {
    const on = await liteAgency(test);
    const tracing = createMemoryTracing();
    const kept: LiteTrace[] = [];
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    const traces = { record: (trace: LiteTrace) => Promise.resolve(void kept.push(trace)) };
    expect(await on.turn(undefined, { tracing, traces })).toBe("replied");

    expect(tracing.turns).toHaveLength(1);
    const [turn] = tracing.turns;
    expect(turn?.start).toMatchObject({
      name: "whatsapp-agent.reply",
      sessionId: on.chat.id,
      organizationId: on.organizationId,
      tags: ["whatsapp-agent", "reply"],
      metadata: { conversationId: on.chat.id, token: on.message.id },
    });
    expect(turn?.generations.map((call) => call.start.name)).toEqual([
      "ai.autopilot.understand_form",
      "ai.autopilot.write_move",
    ]);
    // Between the two calls, code's look-ups and decision, as a step of its own.
    expect(turn?.steps.map((step) => [step.start.name, step.start.type])).toEqual([
      ["look-up-and-decide", "retriever"],
    ]);
    expect(turn?.steps[0]?.ended?.output).toMatchObject({ move: { kind: "greet" }, looked: [] });
    const [sent] = await outbound(on);
    const seen = shown(tracing);
    expect(seen?.input).toEqual([{ role: "user", content: "Hi, is the Kedarnath yatra running?" }]);
    expect(seen?.output).toEqual({ role: "assistant", content: kept[0]?.sent.text });
    expect(sent?.body).toContain("Kedarnath Yatra 4N");
    expect(seen?.metadata).toMatchObject({
      outcome: "replied",
      move: "greet",
      intents: ["hello"],
      understand: { raw: kept[0]?.understand?.raw },
      write: { raw: [written(greeting)] },
      actions: kept[0]?.actions,
      liteTraceId: kept[0]?.id,
    });
    expect(seen?.statusMessage).toBe("replied");
    expect(seen?.level ?? "DEFAULT").toBe("DEFAULT");
    // The sink noted the turn from inside it, and the stored trace was kept as before.
    expect(tracing.strayNotes).toEqual([]);
    expect(kept).toHaveLength(1);
  });

  it("a hand-over because its words were refused is a warning, with the reason", async () => {
    const on = await liteAgency(test);
    const tracing = createMemoryTracing();
    on.model.answer(
      understood([["hello", "Hi"]]),
      written("Only [mystery 1] left!"),
      written("Only [mystery 1] left!"),
    );
    expect(await on.turn(undefined, { tracing })).toBe("handed_off");
    const seen = shown(tracing);
    expect(seen).toMatchObject({ level: "WARNING", metadata: { outcome: "handed_off" } });
    expect(seen?.statusMessage).toMatch(/^handed_off: /);
  });

  it("a turn stopped before any model call is still traced, with why", async () => {
    const on = await liteAgency(test);
    const tracing = createMemoryTracing();
    const entitlements: Entitlements = { ...liteEntitlements, modules: new Set(["crm", "inbox"]) };
    expect(await on.turn(undefined, { tracing, entitlements })).toBe("not_allowed");
    expect(tracing.turns[0]?.generations).toEqual([]);
    expect(shown(tracing)).toMatchObject({ metadata: { outcome: "not_allowed" }, statusMessage: "not_allowed" });
  });

  it("a model that gave no answer makes the turn an error", async () => {
    const on = await liteAgency(test);
    const tracing = createMemoryTracing();
    on.model.answer({ ok: false, reason: "unavailable" });
    expect(await on.turn(undefined, { tracing })).toBe("unavailable");
    expect(tracing.turns[0]?.generations[0]?.end).toEqual({ level: "ERROR", statusMessage: "unavailable" });
    expect(shown(tracing)).toMatchObject({ level: "ERROR", statusMessage: "unavailable" });
    expect(await outbound(on)).toEqual([]);
  });

  it("a follow-up is a nudge turn of the same chat, with the chat's last lines in", async () => {
    const on = await liteAgency(test);
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    expect(await on.turn()).toBe("replied");
    const tracing = createMemoryTracing();
    const followUp = "Hope your day is going well, Rahul. Which trip would you like to go on?";
    on.model.answer(written(followUp));
    expect(await on.nudges(new Date(liteTurnAt.getTime() + 4 * 3_600_000), undefined, tracing)).toBe(1);
    const [turn] = tracing.turns;
    expect(turn?.start).toMatchObject({
      name: "whatsapp-agent.nudge",
      sessionId: on.chat.id,
      tags: ["whatsapp-agent", "nudge"],
    });
    expect(turn?.generations.map((call) => call.start.name)).toEqual(["ai.autopilot.write_move"]);
    const seen = shown(tracing);
    expect(seen?.input).toEqual(
      expect.arrayContaining([{ role: "user", content: "Hi, is the Kedarnath yatra running?" }]),
    );
    expect(seen?.output).toMatchObject({ role: "assistant" });
    expect(JSON.stringify(seen?.output)).toContain("Which trip");
    expect(seen?.metadata).toMatchObject({ outcome: "replied", move: "follow_up" });
  });

  it("Try it is a turn of the person's test chat, the same chat on its next line", async () => {
    const on = await liteAgency(test);
    const tracing = createMemoryTracing();
    const member = memberOf(on.organizationId, "org-owner");
    const tryIt = (messages: { from: "customer" | "agent"; text: string }[]) =>
      tryItTurn(
        {
          db: test.db,
          ai: withTracing(on.model, tracing),
          agencyName: () => Promise.resolve("Sharma Holidays"),
          tracing,
        },
        member,
        { messages, state: null },
        testNow,
      );
    on.model.answer(
      understood([["price_question", "price for kedarnath"]], {
        details: { package: { name: "Kedarnath Yatra 4N", proof: "price for kedarnath", changed: false } },
      }),
      written("Which city will you join us from?"),
    );
    const first = await tryIt([{ from: "customer", text: "price for kedarnath?" }]);
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    await tryIt([
      { from: "customer", text: "price for kedarnath?" },
      { from: "agent", text: first.answer },
      { from: "customer", text: "thanks" },
    ]);

    const [one, two] = tracing.turns;
    expect(one?.start).toMatchObject({
      name: "whatsapp-agent.try-it",
      organizationId: on.organizationId,
      userId: member.userId,
      tags: ["whatsapp-agent", "try-it"],
    });
    expect(one?.start.sessionId).toMatch(/^try-it:/);
    expect(two?.start.sessionId).toBe(one?.start.sessionId);
    expect(one?.generations).toHaveLength(2);
    expect(one?.steps.map((step) => step.start.name)).toEqual(["look-up-and-decide"]);
    expect(shown(tracing)).toMatchObject({
      input: [{ role: "user", content: "price for kedarnath?" }],
      output: { role: "assistant", content: first.answer },
      metadata: { handoff: false, move: first.trace.move },
    });
    expect(shown(tracing, 1)?.input).toEqual([
      { role: "user", content: "price for kedarnath?" },
      { role: "assistant", content: first.answer },
      { role: "user", content: "thanks" },
    ]);
  });
});
