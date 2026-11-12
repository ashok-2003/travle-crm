// The voice rules code can check on a written reply (spec "How it talks"): length, one question, no filler opener, the
// right script, and no claim to be a person or a bot. Run on the reply before its blanks are filled, so the owner's own
// quoted words are never counted against it.
import type { LiteLanguage } from "@travel-crm/contracts/ai";
import { sentencesOf } from "../grounded/phrase-match.js";

export type StyleRefusal = "sentences" | "questions" | "filler" | "script" | "persona";

const MOST_SENTENCES = 3;
const OPENERS = ["great question", "absolutely", "certainly", "of course", "wonderful", "awesome", "बिल्कुल"];
const PERSONA = [
  /\bi(?:'| a)m (?:a )?(?:real )?(?:person|human)\b/i,
  /\bi am (?:an? )?(?:ai|bot)\b|\bi'm an? ai\b|\bjust an ai\b/i,
  /\bbot\b|बॉट/i,
  /main (?:ek )?(?:asli )?insaan|मैं (?:एक )?इंसान|असली इंसान/i,
];
const DEVANAGARI = /[ऀ-ॿ]/;
// What can stand before the first word: spaces, quotes, emoji and other marks.
const BEFORE_WORDS = /^[^\p{L}\p{N}]*/u;

/** Emojis and their parts, kept to one per reply. */
const EMOJI_CLUSTER =
  /\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:[\u{1F3FB}-\u{1F3FF}]|️)*(?:‍\p{Extended_Pictographic}(?:[\u{1F3FB}-\u{1F3FF}]|️)*)*/gu;

export function styleProblem(text: string, language: LiteLanguage): StyleRefusal | null {
  if (sentencesOf(text).length > MOST_SENTENCES) return "sentences";
  if ((text.match(/\?/g) ?? []).length > 1) return "questions";
  const lower = text.replace(/[’]/g, "'").toLowerCase();
  const opening = lower.replace(BEFORE_WORDS, "");
  if (OPENERS.some((opener) => opening.startsWith(opener))) return "filler";
  if (DEVANAGARI.test(text) !== (language === "hindi")) return "script";
  if (PERSONA.some((claim) => claim.test(lower))) return "persona";
  return null;
}

/** Keeps the first emoji and drops the rest. */
export function oneEmoji(text: string): string {
  let seen = false;
  return text
    .replace(EMOJI_CLUSTER, (emoji) => {
      if (seen) return "";
      seen = true;
      return emoji;
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}
