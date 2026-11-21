// The AI's backup: the backup answers only when the first can't (rate limited, unavailable, not set up), never after an
// answer, a refusal of the content or a bad request, nor with under 20 seconds left before the request's deadline, and
// says rate limited when neither answers and either was.
import { describe, expect, it } from "vitest";
import { createMemoryAiModel, withBackupModel } from "../../src/ai/index.js";

const request = { feature: "suggest_reply" as const, messages: [{ role: "user" as const, content: "Hello" }] };

describe("the AI's backup", () => {
  it("is not asked when the first answers or refuses the content", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer("From the first", { ok: false, reason: "refused" });
    const model = withBackupModel(first, backup);
    expect(await model.complete(request)).toMatchObject({ ok: true, text: "From the first" });
    expect(await model.complete(request)).toEqual({ ok: false, reason: "refused" });
    expect(backup.requests).toHaveLength(0);
  });

  it("answers when the first is rate limited or unavailable", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer({ ok: false, reason: "rate_limited" }, { ok: false, reason: "unavailable" });
    backup.answer("From the backup", "Again from the backup");
    const model = withBackupModel(first, backup);
    expect(await model.complete(request)).toMatchObject({ ok: true, text: "From the backup" });
    expect(await model.complete(request)).toMatchObject({ ok: true, text: "Again from the backup" });
  });

  it("says rate limited when neither answers and either was", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer({ ok: false, reason: "rate_limited" });
    backup.answer({ ok: false, reason: "unavailable" });
    expect(await withBackupModel(first, backup).complete(request)).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("a bad_request is final: the backup isn't asked", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer({ ok: false, reason: "bad_request" });
    backup.answer("From the backup");
    expect(await withBackupModel(first, backup).complete(request)).toEqual({ ok: false, reason: "bad_request" });
    expect(backup.requests).toHaveLength(0);
  });

  it("never asks the backup in the middle of a tool round", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer({ ok: false, reason: "unavailable" });
    backup.answer("From the backup");
    const midReply = {
      ...request,
      messages: [
        ...request.messages,
        { role: "assistant" as const, content: "", toolCalls: [{ id: "c1", name: "quote", arguments: "{}" }] },
        { role: "tool" as const, content: "₹9,499", toolCallId: "c1" },
      ],
    };
    expect(await withBackupModel(first, backup).complete(midReply)).toEqual({ ok: false, reason: "unavailable" });
    expect(backup.requests).toHaveLength(0);
  });

  it("asks the backup only while 20 seconds remain before the request's deadline", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer({ ok: false, reason: "unavailable" }, { ok: false, reason: "unavailable" });
    backup.answer("From the backup");
    const model = withBackupModel(first, backup);
    expect(await model.complete({ ...request, deadlineAt: Date.now() + 19_000 })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(backup.requests).toHaveLength(0);
    expect(await model.complete({ ...request, deadlineAt: Date.now() + 30_000 })).toMatchObject({
      ok: true,
      text: "From the backup",
    });
  });

  it("asks the backup with under 20 seconds left when the first has no model for the feature", async () => {
    const first = createMemoryAiModel(); // unscripted: not_configured, as a key with no model for the feature answers
    const backup = createMemoryAiModel();
    backup.answer("From the backup");
    expect(await withBackupModel(first, backup).complete({ ...request, deadlineAt: Date.now() + 5_000 })).toMatchObject(
      { ok: true, text: "From the backup" },
    );
  });

  it("the backup model gets the same schema", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer({ ok: false, reason: "unavailable" });
    backup.answer("{}");
    const schema = { name: "read", jsonSchema: { type: "object" } };
    await withBackupModel(first, backup).complete({ ...request, schema });
    expect(first.requests[0]?.schema).toEqual(schema);
    expect(backup.requests[0]?.schema).toEqual(schema);
  });
});
