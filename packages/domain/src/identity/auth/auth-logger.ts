// Better Auth's log lines, as the structured log takes them (ADR 0032): the level, the message with personal data
// masked, and the first Error among its arguments by name, code and stack frames, never its message. Its other arguments
// (rows, requests, the error objects themselves) never go out: they can hold a person's email address, phone number or
// name.
import { describeError, maskPersonalData } from "@travel-crm/integrations/jobs";
import { errorFields, type Logger } from "@travel-crm/integrations/logging";

type AuthLogLevel = "debug" | "info" | "warn" | "error";

/** Better Auth's messages are short; a long one (a pasted URL, say) is cut. */
const MAX_MESSAGE_LENGTH = 200;

/**
 * Better Auth's `logger` option: warnings and errors (its default level), written to the logger, or without one to the
 * console at the line's level. No `level` is set: with one, Better Auth's router also logs every refusal again through
 * its global default logger, straight to the console.
 */
export function authLogger(logger?: Logger) {
  return {
    log: (level: AuthLogLevel, message: string, ...args: unknown[]) => {
      const text = maskPersonalData(message).slice(0, MAX_MESSAGE_LENGTH);
      const error = args.find((arg) => arg instanceof Error);
      if (logger) {
        logger[level]({ source: "better-auth", ...(error === undefined ? {} : errorFields(error)) }, `auth: ${text}`);
        return;
      }
      const line = `auth ${level}: ${text}${error === undefined ? "" : ` (${describeError(error)})`}`;
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    },
  };
}
