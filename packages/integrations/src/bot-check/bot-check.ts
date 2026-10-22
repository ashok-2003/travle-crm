// The bot-check port (ADR 0008): asks a service whether a form's token came from a person.
export type BotCheckResult = "pass" | "fail" | "unreachable";

export interface BotCheck {
  /** "unreachable" means the service could not be asked or answered an error; the caller decides what that costs. */
  verify(input: { token: string }): Promise<BotCheckResult>;
}
