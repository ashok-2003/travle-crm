// Every AI call written down for the console (the owner, 2026-11-02): the agency (the request's `user`, which every
// feature sets to the organization's id), the feature, the model that answered, the tokens, the time and how it ended.
// Written after the answer, without waiting for it, so the log never slows a reply; a line that can't be written is
// only logged. Every feature calls the model outside its transactions, so the write is a transaction of its own.
import type { Database } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import { errorFields, type Logger } from "@travel-crm/integrations/logging";
import { isUuid } from "../kernel/index.js";

export function withCallLog(model: AiModel, db: Pick<Database, "forOrg">, logger: Logger): AiModel {
  return {
    configured: model.configured,
    async complete(request) {
      const started = Date.now();
      const result = await model.complete(request);
      const organizationId = request.user;
      if (organizationId !== undefined && isUuid(organizationId)) {
        const line = {
          feature: request.feature,
          outcome: result.ok ? "ok" : result.reason,
          model: result.ok ? result.model.slice(0, 120) : "",
          inputTokens: result.ok ? result.inputTokens : 0,
          outputTokens: result.ok ? result.outputTokens : 0,
          durationMs: Date.now() - started,
        };
        db.forOrg(organizationId, (tx) => tx.aiCall.create({ data: line })).catch((error: unknown) => {
          logger.warn({ feature: request.feature, ...errorFields(error) }, "An AI call couldn't be logged");
        });
      }
      return result;
    },
  };
}
