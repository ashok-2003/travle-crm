// Better Auth's log lines, as the one log takes them (spec 9.1): the level and the message with personal data masked,
// and any Error among its arguments by name and code only. Its other arguments (rows, requests, the error objects
// themselves) never go out: they can hold a person's email address, phone number or name.
import { describeError, maskPersonalData } from "@travel-crm/integrations/jobs";

type AuthLogLevel = "debug" | "info" | "warn" | "error";

/** Better Auth's messages are short; a long one (a pasted URL, say) is cut. */
const MAX_MESSAGE_LENGTH = 200;

/**
 * Better Auth's `logger` option: warnings and errors (its default level), written to the process log, or without one
 * to the console at the line's level. No `level` is set: with one, Better Auth's router also logs every refusal again
 * through its global default logger, straight to the console.
 */
export function authLogger(log?: (line: string) => void) {
  return {
    log: (level: AuthLogLevel, message: string, ...args: unknown[]) => {
      const errors = args.filter((arg) => arg instanceof Error).map((error) => describeError(error));
      const line =
        `auth ${level}: ${maskPersonalData(message).slice(0, MAX_MESSAGE_LENGTH)}` +
        (errors.length === 0 ? "" : ` (${errors.join("; ")})`);
      if (log) log(line);
      else if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    },
  };
}
