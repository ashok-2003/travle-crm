// The check on a reply's words (the owner, 2026-11-26): a trip or brochure ID, a tool call written as text, or code
// never reaches the customer. The words are never edited: a miss asks the model again once, then the team takes over.
import { naturalToolNames } from "@travel-crm/contracts/ai";

const TOOL_NAMES = [...naturalToolNames, "show_trips", "look_at_image", "transcribe_voice_note"].join("|");
/** A reply that starts as code: a code block, or a JSON object or list of objects. */
const CODE = /^\s*(?:```|\{|\[\s*\{)/u;
/** A line starting with a trace arrow, or with a tool's name and its opening bracket. */
const TOOL_LINE = new RegExp(`^[ \\t]*(?:[→←]|(?:${TOOL_NAMES})[ \\t]*\\()`, "mu");
/** A tool call in the middle of words: `update_lead(...)`, in backticks or not. */
const TOOL_CALL = new RegExp(`\\b(?:${TOOL_NAMES})[ \\t]*\\(`, "u");

/** What the reply shows that the customer must never see ("T6, T7", "a tool call written as text", "code"); null when clean. */
export function codeInReply(words: string, codes: readonly string[]): string | null {
  const found = codes.filter((code) => new RegExp(`(?<![\\p{L}\\p{N}_])${code}(?![\\p{L}\\p{N}_])`, "u").test(words));
  if (found.length > 0) return found.join(", ");
  if (TOOL_LINE.test(words) || TOOL_CALL.test(words)) return "a tool call written as text";
  return CODE.test(words) ? "code" : null;
}

/** The app's note when the reply showed something it must not: one more chance to write it in words. */
export function codeWords(found: string): string {
  return `Your reply showed ${found}, which the customer must never see. Trip and brochure IDs are for tools only: write the trip's or brochure's name. If you meant to do something, call its tool: never write a tool call or its result as text. Write the reply again, or call stay_quiet.`;
}
