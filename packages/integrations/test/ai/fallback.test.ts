// The AI's backup: the backup answers only when the first can't (rate limited, unavailable, not set up), never after an
// answer or a refusal of the content, and says rate limited when neither answers and either was.
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
});
