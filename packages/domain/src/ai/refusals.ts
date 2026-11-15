// What a refused AI call is called, shared by the features that ask the model (ai3): the reasons the screens have sentences for.
import type { AiFailure } from "@travel-crm/integrations/ai";
import { DomainError } from "../kernel/index.js";

export const refuse = (
  reason: string,
  message: string,
  code: "CONFLICT" | "LIMIT_REACHED" | "VALIDATION" = "CONFLICT",
) => new DomainError(code, reason, message);

/**
 * The refusal for a model that didn't answer; the caller gives the monthly call back first. A bad request (only a request
 * with tools gets one) reads as unavailable.
 */
export function modelRefusal(reason: AiFailure): DomainError {
  return reason === "rate_limited"
    ? refuse("AI_BUSY", "The AI is busy right now")
    : reason === "not_configured"
      ? refuse("AI_NOT_READY", "The AI isn't set up on this server yet")
      : refuse("AI_UNAVAILABLE", "The AI didn't answer");
}
