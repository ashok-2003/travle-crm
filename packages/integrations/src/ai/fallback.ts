// A backup for the AI (the owner, 2026-11-02): a second key or endpoint the call goes to when the first can't answer (rate
// limited, unavailable or not set up). An answer, or a refusal of the content, is the first's and final: the backup would
// only refuse it too. A rate-limited first model rests unasked in its own adapter, so once the first key is used up the
// backup answers at once, without a wasted request first.
import type { AiModel, AiRequest, AiResult } from "./ai-model.js";

export function withBackupModel(first: AiModel, backup: AiModel): AiModel {
  return {
    configured: first.configured || backup.configured,
    async complete(request: AiRequest): Promise<AiResult> {
      const result = await first.complete(request);
      if (result.ok || result.reason === "refused") return result;
      const second = await backup.complete(request);
      if (second.ok || second.reason === "refused") return second;
      // Neither answered: rate limited (try later) if either said so, else what the first said.
      if (result.reason === "rate_limited" || second.reason === "rate_limited")
        return { ok: false, reason: "rate_limited" };
      return second.reason === "not_configured" ? result : second;
    },
  };
}
