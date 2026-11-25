// What never reaches the customer (the owner, 2026-11-26): the agency's trip and brochure IDs (T7, B11) and the agent's
// own tool calls written as words ("`update_lead(adults: 2)`", "→ quote(...)"), which the models sometimes copy into a
// reply despite the prompt (68 of 1,177 live turns showed an ID; Gemini pasted a tool call in a replay). A reply that is
// code (JSON, a code block) is no reply: the turn asks for words once more, then leaves it to the team.
import { naturalToolNames } from "@travel-crm/contracts/ai";

const TOOL_NAMES = [...naturalToolNames, "show_trips", "look_at_image", "transcribe_voice_note"].join("|");
/** A line the model wrote as a tool's trace, starting with an arrow. */
const ARROW_LINE = /^[ \t]*[→←].*(?:\n|$)/gmu;
/** A tool call as words: in backticks or not, a tool's name and its arguments in brackets on one line. */
const TOOL_CALL = new RegExp(`\`*\\b(?:${TOOL_NAMES})\\s*\\([^()\\n]*\\)\`*`, "gu");
/** IDs alone in brackets: "(T7)", "(T7/T8)", "(B6)". */
const BRACKETED_IDS = /[^\S\n]*\([^\S\n]*[TB]\d{1,3}(?:[^\S\n]*[/,&][^\S\n]*[TB]?\d{1,3})*[^\S\n]*\)/gu;
/** IDs standing as words: "T4 batch", "T7/T8", "Manali T7". A word like B2B is not one. */
const BARE_IDS = /[^\S\n]*\b[TB]\d{1,3}(?:[^\S\n]*\/[^\S\n]*[TB]?\d{1,3})*\b/gu;
/** A reply that starts as code: a code block, or a JSON object or list of objects. */
const CODE = /^\s*(?:```|\{|\[\s*\{)/u;

/** Tidies a line after words left it: no doubled spaces, no space inside brackets or before a mark. */
const tidy = (line: string) =>
  line
    .replace(/[^\S\n]{2,}/gu, " ")
    .replace(/\(\s+/gu, "(")
    .replace(/\s+\)/gu, ")")
    .replace(/\(\)/gu, "")
    .replace(/\s+([.,!?])/gu, "$1")
    .trim();

/** The reply without IDs or tool calls; "" when it was code, or nothing is left. */
export function cleanReply(words: string): string {
  if (CODE.test(words)) return "";
  const cleaned = words
    .replace(ARROW_LINE, "")
    .replace(TOOL_CALL, "")
    .replace(BRACKETED_IDS, "")
    .replace(BARE_IDS, "")
    .split("\n")
    .map(tidy)
    .join("\n")
    .trim();
  return CODE.test(cleaned) ? "" : cleaned;
}

/** The app's note when the reply was only code or tool calls: one more chance to write it in words. */
export const CODE_WORDS =
  "Your reply was code or a tool call, which the customer must never see. Write the reply in plain words, or call stay_quiet.";
