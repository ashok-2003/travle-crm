// Better Auth's log lines, as the structured log takes them (ADR 0032): the level, the message when it is one Better Auth
// itself can write, and the first Error among its arguments by name, code and stack frames, never its message. Its
// messages are free text that can quote what it was working on, so a message is written only when it is
// - one of the sentences in Better Auth's own code (better-auth-messages.ts, checked against the installed package by
//   a test), whole; or
// - one of those that goes on with a value, cut back to its fixed start and an ellipsis; or
// - "Invalid <what>:" and a URL cut back to its origin; or
// - the name of an error class.
// Anything else is withheld: "auth message withheld", with the error's fields. Its other arguments (rows, requests, the
// error objects themselves) never go out.
import { describeError } from "@travel-crm/integrations/jobs";
import { errorFields, type Logger } from "@travel-crm/integrations/logging";
import { MESSAGE_PREFIXES, STATIC_MESSAGES } from "./better-auth-messages.js";

type AuthLogLevel = "debug" | "info" | "warn" | "error";

/** A URL's origin is all a log needs of it: the path can hold a token and the query a person's data. */
const URL_TAIL = /(https?:\/\/[^\s/?#"'`]+)\S*/g;
/** "Invalid origin: https://evil.example", "Invalid redirectURL: https://…": the sentence, then an origin. */
const INVALID_URL = /^Invalid [A-Za-z ]{1,30}: https?:\/\/[^\s/?#]+$/;
/** Better Auth logs an error's name when it has no sentence: "Error", "PrismaClientKnownRequestError". */
const ERROR_NAME = /^[A-Z][A-Za-z]{0,60}Error$|^Error$/;

const STATICS = new Set(STATIC_MESSAGES);
const WITHHELD = "auth message withheld";

function publishable(message: string): string | null {
  const cut = message.replace(URL_TAIL, "$1");
  if (INVALID_URL.test(cut)) return cut;
  if (STATICS.has(message) || ERROR_NAME.test(message)) return message;
  const prefix = MESSAGE_PREFIXES.find((candidate) => message.startsWith(candidate));
  return prefix === undefined ? null : `${prefix}…`;
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
