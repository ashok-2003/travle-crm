// The AI's chain of keys: the next member answers only when the ones before can't (rate limited, unavailable, not set up),
// never after an answer, a refusal of the content or a bad request, nor with under 20 seconds left before the request's
// deadline, and says rate limited when none answers and any was. A tool round goes back only to the members serving the
// model that wrote its calls.
import { describe, expect, it } from "vitest";
import { createMemoryAiModel, withModelChain, type AiRequest } from "../../src/ai/index.js";

const request = { feature: "suggest_reply" as const, messages: [{ role: "user" as const, content: "Hello" }] };

/** A scripted member that serves this one model, as an adapter whose lists name it. */
function serving(model: string) {
  const ai = createMemoryAiModel();
  return { ai, member: { ...ai, serves: (name: string) => name === model } };
}

/** A request answering the calls this model wrote. */
const toolRoundBy = (model: string): AiRequest => ({
  ...request,
  messages: [
    ...request.messages,
    { role: "assistant", content: "", model, toolCalls: [{ id: "c1", name: "quote", arguments: "{}" }] },
    { role: "tool", content: "₹9,499", toolCallId: "c1" },
  ],
});

const VERTEX = "google/gemini-3.5-flash-lite";
const STUDIO = "gemini-3.5-flash-lite";

describe("the AI's chain of keys", () => {
  it("doesn't ask the next when the first answers or refuses the content", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer("From the first", { ok: false, reason: "refused" });
    const model = withModelChain([first, backup]);
    expect(await model.complete(request)).toMatchObject({ ok: true, text: "From the first" });
    expect(await model.complete(request)).toEqual({ ok: false, reason: "refused" });
    expect(backup.requests).toHaveLength(0);
  });

  it("answers from the backup when the first is rate limited or unavailable", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer({ ok: false, reason: "rate_limited" }, { ok: false, reason: "unavailable" });
    backup.answer("From the backup", "Again from the backup");
    const model = withModelChain([first, backup]);
    expect(await model.complete(request)).toMatchObject({ ok: true, text: "From the backup" });
    expect(await model.complete(request)).toMatchObject({ ok: true, text: "Again from the backup" });
  });

  it("walks the whole chain for a fresh request, until one answers", async () => {
    const members = [createMemoryAiModel(), createMemoryAiModel(), createMemoryAiModel()] as const;
    members[0].answer({ ok: false, reason: "unavailable" });
    members[1].answer({ ok: false, reason: "rate_limited" });
    members[2].answer("From the third");
    expect(await withModelChain(members).complete(request)).toMatchObject({ ok: true, text: "From the third" });
  });

  it("says rate limited when none answers and any was", async () => {
    const members = [createMemoryAiModel(), createMemoryAiModel(), createMemoryAiModel()] as const;
    members[0].answer({ ok: false, reason: "unavailable" });
    members[1].answer({ ok: false, reason: "rate_limited" });
    members[2].answer({ ok: false, reason: "unavailable" });
    expect(await withModelChain(members).complete(request)).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("says what the first said when the rest have no model for the feature", async () => {
    const first = createMemoryAiModel();
    first.answer({ ok: false, reason: "unavailable" });
    expect(await withModelChain([first, createMemoryAiModel()]).complete(request)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("a bad_request is final: the backup isn't asked", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer({ ok: false, reason: "bad_request" });
    backup.answer("From the backup");
    expect(await withModelChain([first, backup]).complete(request)).toEqual({ ok: false, reason: "bad_request" });
    expect(backup.requests).toHaveLength(0);
  });

  it("sends a tool round only to the members serving the model that wrote its calls, in order", async () => {
    const vertex = serving(VERTEX);
    const studio = serving(STUDIO);
    const studioTwo = serving(STUDIO);
    const model = withModelChain([vertex.member, studio.member, studioTwo.member]);
    // The backup wrote the calls: Vertex, which refuses its signatures, is never asked; the second key, same name, is.
    studio.ai.answer({ ok: false, reason: "unavailable" }, "From the backup");
    studioTwo.ai.answer("From the second backup");
    expect(await model.complete(toolRoundBy(STUDIO))).toMatchObject({ ok: true, text: "From the second backup" });
    expect(await model.complete(toolRoundBy(STUDIO))).toMatchObject({ ok: true, text: "From the backup" });
    // The app's check on a transcript the backup wrote goes back to the backup too.
    studio.ai.answer("Checked by the backup");
    const checked: AiRequest = {
      ...request,
      messages: [
        ...toolRoundBy(STUDIO).messages,
        { role: "assistant", content: "Booked.", model: STUDIO },
        { role: "user", content: "Check the dates." },
      ],
    };
    expect(await model.complete(checked)).toMatchObject({ ok: true, text: "Checked by the backup" });
    expect(vertex.ai.requests).toHaveLength(0);
    // Vertex wrote them: only Vertex is asked, and its failure is the answer.
    vertex.ai.answer({ ok: false, reason: "unavailable" });
    expect(await model.complete(toolRoundBy(VERTEX))).toEqual({ ok: false, reason: "unavailable" });
    expect([studio.ai.requests.length, studioTwo.ai.requests.length]).toEqual([3, 1]);
  });

  it("sends a tool round to the first member alone when none says it serves the model that wrote it", async () => {
    const first = createMemoryAiModel();
    const backup = serving(STUDIO);
    first.answer({ ok: false, reason: "unavailable" });
    expect(await withModelChain([first, backup.member]).complete(toolRoundBy("other/model"))).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(backup.ai.requests).toHaveLength(0);
  });

  it("asks the next only while 20 seconds remain before the request's deadline", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer({ ok: false, reason: "unavailable" }, { ok: false, reason: "unavailable" });
    backup.answer("From the backup");
    const model = withModelChain([first, backup]);
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

  it("asks the next with under 20 seconds left while none before had a model for the feature", async () => {
    const first = createMemoryAiModel(); // unscripted: not_configured, as a key with no model for the feature answers
    const second = createMemoryAiModel();
    const third = createMemoryAiModel();
    third.answer("From the third");
    expect(
      await withModelChain([first, second, third]).complete({ ...request, deadlineAt: Date.now() + 5_000 }),
    ).toMatchObject({ ok: true, text: "From the third" });
  });

  it("the backup model gets the same schema", async () => {
    const first = createMemoryAiModel();
    const backup = createMemoryAiModel();
    first.answer({ ok: false, reason: "unavailable" });
    backup.answer("{}");
    const schema = { name: "read", jsonSchema: { type: "object" } };
    await withModelChain([first, backup]).complete({ ...request, schema });
    expect(first.requests[0]?.schema).toEqual(schema);
    expect(backup.requests[0]?.schema).toEqual(schema);
  });
});
