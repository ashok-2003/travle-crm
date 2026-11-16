// Each model call of a natural turn, counted against the month's limit as lite's are (`countedCall`): reserved right
// before the call in a transaction of its own, its tokens kept when a model answered, given back when none did.
import type { AiModel } from "@travel-crm/integrations/ai";
import { countedCall, type CallEnvironment } from "../lite/counted-call.js";
import type { LoopIO } from "./loop/types.js";

export function countedModel(ai: AiModel, environment: CallEnvironment): LoopIO["call"] {
  return (request) =>
    countedCall(environment, async () => {
      const result = await ai.complete(request);
      if (!result.ok) return result;
      const { model, inputTokens, outputTokens } = result;
      return { ...result, usage: { model, inputTokens, outputTokens } };
    });
}
