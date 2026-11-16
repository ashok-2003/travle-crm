// The tracing port as the domain's tests see it: the in-memory adapter keeps each turn with the notes and model calls made
// in its async context (after awaits and timers too, and never another turn's), and none just runs the work. Both hand
// back the work's result or error exactly.
import { setTimeout as wait } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { createMemoryTracing, notedTurn, noTracing, type TurnStart } from "../../src/tracing/index.js";

const start = (sessionId: string): TurnStart => ({
  name: "whatsapp-agent.reply",
  sessionId,
  organizationId: "org-1",
  tags: ["whatsapp-agent"],
  input: [{ role: "user", content: "Hi" }],
});

describe("the in-memory tracing", () => {
  it("keeps a turn's notes and model calls, made after awaits and timers too", async () => {
    const tracing = createMemoryTracing();
    const value = await tracing.turn(start("chat-1"), async () => {
      await wait(5);
      const call = tracing.generation({ name: "ai.autopilot", input: [] });
      await Promise.resolve();
      call.end({ output: "Hello", model: "m", usage: { input: 3, output: 1 } });
      setTimeout(() => undefined, 0);
      await new Promise<void>((resolve) => {
        setImmediate(() => {
          tracing.note({ output: "sent", metadata: { outcome: "replied" } });
          resolve();
        });
      });
      return 7;
    });
    expect(value).toBe(7);
    const [turn] = tracing.turns;
    expect(turn?.start.sessionId).toBe("chat-1");
    expect(turn?.notes).toEqual([{ output: "sent", metadata: { outcome: "replied" } }]);
    expect(turn?.generations.map((call) => call.end?.output)).toEqual(["Hello"]);
    expect(turn?.ended).toBe(true);
    expect(tracing.generations[0]?.turn).toBe(turn);
  });

  it("never mixes two turns running at once, and drops a note made outside any", async () => {
    const tracing = createMemoryTracing();
    tracing.note({ output: "stray" });
    const loose = tracing.generation({ name: "ai.suggest_reply", input: [] });
    loose.end({ output: "draft" });
    await Promise.all(
      ["a", "b"].map((id) =>
        tracing.turn(start(id), async () => {
          await wait(id === "a" ? 10 : 1);
          tracing.note({ output: id });
        }),
      ),
    );
    expect(tracing.turns.map((turn) => [turn.start.sessionId, turn.notes])).toEqual([
      ["a", [{ output: "a" }]],
      ["b", [{ output: "b" }]],
    ]);
    expect(tracing.strayNotes).toEqual([{ output: "stray" }]);
    expect(tracing.generations[0]?.turn).toBeNull();
  });

  it("rethrows the work's own error, and keeps its name, code and reason", async () => {
    const tracing = createMemoryTracing();
    const error = Object.assign(new Error("customer 9876543210 said so"), {
      name: "DomainError",
      code: "CONFLICT",
      reason: "AI_UNAVAILABLE",
    });
    await expect(
      tracing.turn(start("chat-1"), () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(tracing.turns[0]?.failure).toBe("DomainError CONFLICT AI_UNAVAILABLE");
  });

  it("shows a turn as Langfuse would: metadata merged by key, the rest replaced", async () => {
    const tracing = createMemoryTracing();
    await tracing.turn({ ...start("chat-1"), metadata: { token: "m1" } }, () => {
      tracing.note({ input: "words", metadata: { outcome: "replied" } });
      tracing.note({ output: "sent", level: "WARNING", metadata: { move: "greet" } });
      return Promise.resolve();
    });
    const [turn] = tracing.turns;
    expect(turn === undefined ? null : notedTurn(turn)).toEqual({
      input: "words",
      output: "sent",
      level: "WARNING",
      metadata: { token: "m1", outcome: "replied", move: "greet" },
    });
  });

  it("counts flushes and the shutdown", async () => {
    const tracing = createMemoryTracing();
    await tracing.flush();
    await tracing.shutdown();
    expect([tracing.flushes, tracing.shutDown]).toEqual([1, true]);
  });
});

describe("no tracing", () => {
  it("runs the work and hands back its result or its error", async () => {
    expect(await noTracing.turn(start("chat-1"), () => Promise.resolve("done"))).toBe("done");
    const error = new Error("boom");
    await expect(noTracing.turn(start("chat-1"), () => Promise.reject(error))).rejects.toBe(error);
    noTracing.note({ output: "nowhere" });
    noTracing.generation({ name: "ai.suggest_reply", input: [] }).end({ output: "x" });
    await expect(noTracing.flush()).resolves.toBeUndefined();
  });
});
