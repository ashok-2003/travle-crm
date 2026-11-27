// The check on a reply's words (the owner, 2026-11-26 and 27): a trip or brochure ID, a tool call or a tool's name
// written as text, the model's own notes about the customer, or code never reaches the customer. The words are never
// edited: a miss asks the model again once, then the team takes over.
import { naturalToolNames } from "@travel-crm/contracts/ai";

const NAMES = [...naturalToolNames, "show_trips", "look_at_image", "transcribe_voice_note"];
const TOOL_NAMES = NAMES.join("|");
/** A reply that starts as code: a code block, or a JSON object or list of objects. */
const CODE = /^\s*(?:```|\{|\[\s*\{)/u;
/** A line starting with a trace arrow, or with a tool's name and its opening bracket. */
const TOOL_LINE = new RegExp(`^[ \\t]*(?:[→←]|(?:${TOOL_NAMES})[ \\t]*\\()`, "mu");
/** A tool call in the middle of words: `update_lead(...)`, in backticks or not. */
const TOOL_CALL = new RegExp(`\\b(?:${TOOL_NAMES})[ \\t]*\\(`, "u");
/**
 * A tool's name with no bracket ("[stay_quiet reason: ...]"): one with an underscore anywhere, as no word has one; one
 * that is also a word (book, quote) only in backticks.
 */
const TOOL_NAME = new RegExp(
  `\\b(?:${NAMES.filter((name) => name.includes("_")).join("|")})\\b|\`(?:${TOOL_NAMES})\``,
  "u",
);
/** The model's notes on the turn, sent as the reply (live, 23 to 27 Nov): they speak of the customer, not to them. */
const NOTES = /^\W*The (?:customer|user)\b|^\W*The lead (?:has|is|was|should|wants|said)\b/iu;

/** What the reply shows that the customer must never see ("T6, T7", "a tool's name", "code"...); null when clean. */
export function codeInReply(words: string, codes: readonly string[]): string | null {
  const found = codes.filter((code) => new RegExp(`(?<![\\p{L}\\p{N}_])${code}(?![\\p{L}\\p{N}_])`, "u").test(words));
  if (found.length > 0) return found.join(", ");
  if (TOOL_LINE.test(words) || TOOL_CALL.test(words)) return "a tool call written as text";
  if (TOOL_NAME.test(words)) return "a tool's name";
  if (NOTES.test(words)) return "notes about the customer";
  return CODE.test(words) ? "code" : null;
}

/** The app's note when the reply showed something it must not: one more chance to write it in words. */
export function codeWords(found: string): string {
  return `Your reply showed ${found}, which the customer must never see. Your reply is sent to the customer exactly as you write it: write only what you would say to them. Trip and brochure IDs are for tools only: write the trip's or brochure's name. If you meant to do something, call its tool: never write a tool call, a tool's name or its result as text. Write the reply again, or call stay_quiet.`;
}
