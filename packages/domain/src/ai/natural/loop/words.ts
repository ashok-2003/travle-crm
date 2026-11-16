// The words of a natural reply and the app's own notes: a copied stamp or label off the start of each message (spec 4.3,
// pre-flight #16), at most two WhatsApp messages split at a line of `---` (ruling 22 as prompt v2 writes it: a blank line
// is spacing inside a message, a list's or a paragraph's), the app checks the model reads (ruling 14), and the task a
// fallback leaves the team.
import type { AiMessage } from "@travel-crm/integrations/ai";
import { NATURAL_LIMITS, type FallbackReason } from "./types.js";

/** What the chat puts before a line ("[Sat 14 Nov, 11:42 pm]", "(Team, Amit)", "[automatic]"), which a model may copy. */
const COPIED = /^(?:\[[^\]\n]{1,120}\]|\(Team(?:, [^)\n]{1,80})?\))\s*/u;
/** A line of exactly `---`, spaces around it allowed: where one message ends and the next begins. */
const SEPARATOR = /^[^\S\n]*---[^\S\n]*$/mu;
/** How messages are joined to be split again: the words the guards check hold the same two messages. */
const BETWEEN = "\n---\n";

function withoutCopied(text: string): string {
  let words = text.trim();
  while (COPIED.test(words)) words = words.replace(COPIED, "");
  return words;
}

/**
 * The words before the first `---` line, then the rest: at most two messages, each trimmed, none empty (a `---` at the
 * start or the end makes none). A third part stays in the second message, after a blank line.
 */
export function splitMessages(words: string): string[] {
  const parts = words
    .split(SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const [first, ...rest] = parts;
  if (first === undefined) return [];
  return rest.length === 0 ? [first] : [first, rest.join("\n\n")];
}

/** The words as they would go, each message without a copied prefix: what the guards check is what is sent. */
export function replyWords(text: string): string {
  return splitMessages(withoutCopied(text))
    .map(withoutCopied)
    .filter((message) => message !== "")
    .join(BETWEEN);
}

/** A note from the app: a user message, so marked, that no customer line can be (theirs start with a time). */
export const appCheck = (note: string): AiMessage => ({
  role: "user",
  content: `[app check, not from the customer] ${note}`,
});
export const NO_WORDS = "Your reply had no words. Write the reply, or call stay_quiet.";
/** A hand-over owes the customer a line (spec 3.5): the prompt's own words for it. */
export const HAND_OVER_WORDS =
  "Your hand-over had no words. Write one short line saying you've told the team and they'll reply here.";

const WHY: Record<FallbackReason, string> = {
  cap: `The AI used its ${String(NATURAL_LIMITS.calls)} calls without a reply it could send`,
  deadline: "The AI ran out of time before a reply it could send",
  model: "The AI wrote no reply",
  "guard:G1": "The AI's reply twice held an amount that isn't in the agency's prices",
  "guard:G2": "The AI's reply twice left out its offer's date and advance",
  "guard:G3": "The AI's reply twice said a payment or booking was done, which the data doesn't show",
  "guard:G4": "The AI's reply twice named a discount or a team promise nobody gave",
  "guard:G5": "The AI's reply twice typed payment details",
};
/** The most a task's text holds (`create_task`'s limit). */
const TASK_CHARS = 500;

const clip = (text: string, most: number) => {
  const line = text.replace(/\s+/gu, " ").trim();
  return line.length <= most ? line : `${line.slice(0, most - 1)}…`;
};

/**
 * The team's task after a fallback: why, what the customer wrote, what wasn't done (a booking, a brochure), and the draft
 * to correct and send, if any; what wasn't done comes before the draft, so a long draft never cuts it off.
 */
export function fallbackTask(input: {
  reason: FallbackReason;
  line: string;
  customerText: string;
  dropped: readonly string[];
  draft: string | null;
}): string {
  const { reason, line, customerText, dropped, draft } = input;
  const parts = [
    `${WHY[reason]}, so the customer got "${line}".`,
    customerText.trim() === "" ? "" : `They wrote: "${clip(customerText, 160)}".`,
    dropped.length === 0 ? "" : `Not done: ${dropped.join("; ")}.`,
    draft === null ? "Why on this turn shows what it tried." : `Its draft, to correct and send: "${clip(draft, 200)}"`,
  ];
  return clip(parts.filter((part) => part !== "").join(" "), TASK_CHARS);
}
