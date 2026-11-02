// The AI model with its failures told to the console (the owner, 2026-11-02): a call no model answered (down, or every
// key's limit used up) is reported as an incident, named by the feature that asked. A refusal of the content or an AI
// that isn't set up is no incident.
import type { AiModel } from "@travel-crm/integrations/ai";
import type { IncidentReporter } from "../jobs/index.js";

export function withIncidentReports(model: AiModel, reporter: IncidentReporter): AiModel {
  return {
    configured: model.configured,
    async complete(request) {
      const result = await model.complete(request);
      if (!result.ok && result.reason === "rate_limited") reporter.report("ai.rate-limited", request.feature);
      if (!result.ok && result.reason === "unavailable") reporter.report("ai.unavailable", request.feature);
      return result;
    },
  };
}
