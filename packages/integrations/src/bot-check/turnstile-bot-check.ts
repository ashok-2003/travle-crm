// Cloudflare Turnstile's siteverify behind the bot-check port. Any trouble reaching it is "unreachable", never an error.
import type { BotCheck } from "./bot-check.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileSettings {
  secretKey: string;
  /** Tests point it at a fake siteverify. */
  verifyUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export function createTurnstileBotCheck(options: TurnstileSettings): BotCheck {
  const send = options.fetch ?? fetch;
  return {
    verify: async ({ token, address }) => {
      const body = new URLSearchParams({ secret: options.secretKey, response: token });
      if (address !== null) body.set("remoteip", address);
      try {
        const response = await send(options.verifyUrl ?? SITEVERIFY_URL, {
          method: "POST",
          body,
          signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
        });
        if (!response.ok) return "unreachable";
        const answer: unknown = await response.json();
        const success = typeof answer === "object" && answer !== null && "success" in answer && answer.success;
        return success === true ? "pass" : "fail";
      } catch {
        // The message of a network error can name the request, and the request holds the secret.
        return "unreachable";
      }
    },
  };
}
