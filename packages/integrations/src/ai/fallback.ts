// A backup for the AI (the owner, 2026-11-02): a second key or endpoint the call goes to when the first can't answer (rate
// limited, unavailable or not set up). An answer, a refusal of the content or a bad request is the first's and final: the
// backup would only refuse it too. A rate-limited first model rests unasked in its own adapter, so once the first key is
// used up the backup answers at once, without a wasted request first. A request with a deadline goes to the backup only
// while 10 seconds of it remain.
import { NEXT_MODEL_MIN_LEFT_MS, type AiModel, type AiRequest, type AiResult } from "./ai-model.js";

/** An answer, or a failure no other key or endpoint would turn into one. */
type Final = Extract<AiResult, { ok: true }> | { ok: false; reason: "refused" | "bad_request" };
const isFinal = (result: AiResult): result is Final =>
  result.ok || result.reason === "refused" || result.reason === "bad_request";

export function withBackupModel(first: AiModel, backup: AiModel): AiModel {
  return {
    configured: first.configured || backup.configured,
    async complete(request: AiRequest): Promise<AiResult> {
      const result = await first.complete(request);
      if (isFinal(result)) return result;
      if (request.deadlineAt !== undefined && request.deadlineAt - Date.now() < NEXT_MODEL_MIN_LEFT_MS) return result;
      const second = await backup.complete(request);
      if (isFinal(second)) return second;
      // Neither answered: rate limited (try later) if either said so, else what the first said.
      if (result.reason === "rate_limited" || second.reason === "rate_limited")
        return { ok: false, reason: "rate_limited" };
      return second.reason === "not_configured" ? result : second;
    },
  };
}
