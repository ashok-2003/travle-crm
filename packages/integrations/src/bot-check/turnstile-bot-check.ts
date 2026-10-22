// Cloudflare Turnstile's siteverify behind the bot-check port. A visitor's own mistake (a bad or spent token) refuses;
// trouble that is ours or Cloudflare's is "unreachable", so no visitor is refused for it (W39, fail open).
import type { Logger } from "../logging/index.js";
import type { BotCheck } from "./bot-check.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Codes that mean Cloudflare failed, or we sent a wrong secret: never the visitor's fault. */
const FAIL_OPEN_CODES = new Set(["internal-error", "invalid-input-secret", "missing-input-secret"]);
/** The ones that are our misconfiguration, which someone must notice. */
const OUR_MISTAKE_CODES = new Set(["invalid-input-secret", "missing-input-secret"]);

export interface TurnstileSettings {
  secretKey: string;
  /** Tests point it at a fake siteverify. */
  verifyUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** Where our own misconfiguration is reported, once per adapter. */
  logger?: Logger;
}

function errorCodesOf(answer: unknown): string[] {
  if (typeof answer !== "object" || answer === null || !("error-codes" in answer)) return [];
  const codes = answer["error-codes"];
  return Array.isArray(codes) ? codes.filter((code): code is string => typeof code === "string") : [];
}

export function createTurnstileBotCheck(options: TurnstileSettings): BotCheck {
  const send = options.fetch ?? fetch;
  let reported = false;
  const reportOnce = (what: string) => {
    if (reported) return;
    reported = true;
    options.logger?.error({ turnstile: what }, "Turnstile refused our request, so enquiries are accepted unchecked");
  };
  return {
    // The address is not sent: only its rate-limit form is known here, and Cloudflare's remoteip is optional.
    verify: async ({ token }) => {
      const body = new URLSearchParams({ secret: options.secretKey, response: token });
      try {
        const response = await send(options.verifyUrl ?? SITEVERIFY_URL, {
          method: "POST",
          body,
          signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
        });
        if (response.status >= 400 && response.status < 500) {
          reportOnce(`http-${String(response.status)}`);
          return "unreachable";
        }
        if (!response.ok) return "unreachable";
        const answer: unknown = await response.json();
        if (typeof answer === "object" && answer !== null && "success" in answer && answer.success === true) {
          return "pass";
        }
        const codes = errorCodesOf(answer);
        const ours = codes.find((code) => OUR_MISTAKE_CODES.has(code));
        if (ours !== undefined) reportOnce(ours);
        return codes.some((code) => FAIL_OPEN_CODES.has(code)) ? "unreachable" : "fail";
      } catch {
        // The message of a network error can name the request, and the request holds the secret.
        return "unreachable";
      }
    },
  };
}
