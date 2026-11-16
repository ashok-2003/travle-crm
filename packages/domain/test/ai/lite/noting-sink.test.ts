// The noting sink keeps the turn's stored trace whatever the tracing does: a note that throws (the tracing's own fault, or a
// trace it can't describe) never stops the inner sink or reaches the turn.
import type { AiTracing } from "@travel-crm/integrations/tracing";
import { noTracing } from "@travel-crm/integrations/tracing";
import { describe, expect, it } from "vitest";
import { notingSink } from "../../../src/ai/lite/turn-notes.js";
import { startTrace } from "../../../src/ai/lite/turn-trace.js";
import type { LiteTrace } from "../../../src/ai/lite/types.js";

const trace = (): LiteTrace => ({
  ...startTrace(
    { organizationId: "org-1", conversationId: "chat-1", kind: "reply", token: "m1" },
    null,
    new Date("2026-11-16T08:00:00Z"),
  ),
  outcome: "replied",
});

describe("the noting sink", () => {
  it("still keeps the stored trace when the tracing's note throws", async () => {
    const throwing: AiTracing = {
      ...noTracing,
      note: () => {
        throw new Error("the tracing broke");
      },
    };
    const kept: LiteTrace[] = [];
    const sink = notingSink(throwing, { record: (one) => Promise.resolve(void kept.push(one)) });
    const one = trace();
    await expect(sink.record(one)).resolves.toBeUndefined();
    expect(kept).toEqual([one]);
    // Not noted, so the turn may still note its outcome alone.
    expect(sink.noted).toBe(false);
  });

  it("notes the turn and keeps its trace", async () => {
    const notes: unknown[] = [];
    const kept: LiteTrace[] = [];
    const sink = notingSink(
      { ...noTracing, note: (note) => void notes.push(note) },
      { record: (one) => Promise.resolve(void kept.push(one)) },
    );
    await sink.record(trace());
    expect(notes).toHaveLength(1);
    expect(kept).toHaveLength(1);
    expect(sink.noted).toBe(true);
  });
});
