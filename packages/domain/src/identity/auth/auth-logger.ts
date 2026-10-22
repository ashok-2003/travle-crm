// Better Auth's log lines, as the structured log takes them (ADR 0032): the level, the message when it is one of Better
// Auth's own sentences, and the first Error among its arguments by name, code and stack frames, never its message. Its
// messages are free text that can quote what it was working on, so a message is written only when it is plain prose
// (a short sentence of letters, spaces and a little punctuation, with at most one colon: no address, number or quoted
// value can be in it) or "Invalid <what>:" and a
// URL cut back to its origin. Anything else is withheld: "auth message withheld", with the error's fields. Its other
// arguments (rows, requests, the error objects themselves) never go out.
import { describeError } from "@travel-crm/integrations/jobs";
import { errorFields, type Logger } from "@travel-crm/integrations/logging";

type AuthLogLevel = "debug" | "info" | "warn" | "error";

/** A URL's origin is all a log needs of it: the path can hold a token and the query a person's data. */
const URL_TAIL = /(https?:\/\/[^\s/?#"'`]+)\S*/g;
/** "Invalid origin: https://evil.example", "Invalid redirectURL: https://…": the sentence, then an origin. */
const INVALID_URL = /^Invalid [A-Za-z ]{1,30}: https?:\/\/[^\s/?#]+$/;
/** Better Auth's own sentences: "Failed to create user", "Reset Password: User not found". */
const PROSE = /^[A-Za-z][A-Za-z .,'\-!]*(: [A-Za-z][A-Za-z .,'\-!]*)?$/;
const MAX_WORDS = 10;

const WITHHELD = "auth message withheld";

function publishable(message: string): string | null {
  const cut = message.replace(URL_TAIL, "$1");
  const short = cut.split(/\s+/).length <= MAX_WORDS;
  return INVALID_URL.test(cut) || (short && PROSE.test(cut)) ? cut : null;
}

/**
 * Better Auth's `logger` option: warnings and errors (its default level), written to the logger, or without one to the
 * console at the line's level. No `level` is set: with one, Better Auth's router also logs every refusal again through
 * its global default logger, straight to the console.
 */
export function authLogger(logger?: Logger) {
  return {
    log: (level: AuthLogLevel, message: string, ...args: unknown[]) => {
      const text = publishable(message);
      const error = args.find((arg) => arg instanceof Error);
      if (logger) {
        logger[level](
          {
            source: "better-auth",
            ...(text === null ? { messageWithheld: true } : {}),
            ...(error === undefined ? {} : errorFields(error)),
          },
          text === null ? WITHHELD : `auth: ${text}`,
        );
        return;
      }
      const line = `auth ${level}: ${text ?? WITHHELD}${error === undefined ? "" : ` (${describeError(error)})`}`;
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    },
  };
}
