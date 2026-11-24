// A chain of keys for the AI (the owner, 2026-11-02 and 2026-11-22): the next key or endpoint is asked when the ones before
// can't answer (rate limited, unavailable or not set up). An answer, a refusal of the content or a bad request is final:
// the next would only refuse it too. A rate-limited model rests unasked in its own adapter, so once a key is used up the
// next answers at once, without a wasted request first. A request with a deadline goes to the next only while 20 seconds
// of it remain (`NEXT_MODEL_MIN_LEFT_MS`), unless none before had a model for it. A tool round goes back only to the
// members serving the model that wrote its calls (the first when none says so): another endpoint refuses their thought
// signatures (a 400, live both ways between Vertex and AI Studio), while two AI Studio keys finish each other's rounds.
import { NEXT_MODEL_MIN_LEFT_MS, type AiFailure, type AiModel, type AiRequest, type AiResult } from "./ai-model.js";

/** An answer, or a failure no other key or endpoint would turn into one. */
type Final = Extract<AiResult, { ok: true }> | { ok: false; reason: "refused" | "bad_request" };
const isFinal = (result: AiResult): result is Final =>
  result.ok || result.reason === "refused" || result.reason === "bad_request";

/**
 * The model a request goes on from: its last answer's, when it names one (only answers of the turn under way do, so a
 * tool round, or the app's check on a transcript, whose calls carry that endpoint's signatures).
 */
const writerOf = (request: AiRequest): string | undefined =>
  request.messages.findLast((message) => message.role === "assistant")?.model;

export function withModelChain(models: readonly AiModel[]): AiModel {
  return {
    configured: models.some((model) => model.configured),
    // A chain inside a chain (the keys behind the primary model) serves what any of its members serves.
    serves: (model) => models.some((member) => member.serves?.(model) === true),
    async complete(request: AiRequest): Promise<AiResult> {
      const writer = writerOf(request);
      const serving = writer === undefined ? models : models.filter((model) => model.serves?.(writer) === true);
      // None answered yet: rate limited (try later) once any says so, else the last that had a model for the feature.
      let failure: AiFailure = "not_configured";
      for (const model of serving.length === 0 ? models.slice(0, 1) : serving) {
        const late = request.deadlineAt !== undefined && request.deadlineAt - Date.now() < NEXT_MODEL_MIN_LEFT_MS;
        if (late && failure !== "not_configured") break;
        const result = await model.complete(request);
        if (isFinal(result)) return result;
        if (failure !== "rate_limited" && result.reason !== "not_configured") failure = result.reason;
      }
      return { ok: false, reason: failure };
    },
  };
}
