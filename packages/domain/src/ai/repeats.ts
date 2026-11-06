// Whether the AI's reply says again what was sent in the chat already (the owner, 2026-11-02: it repeated itself): the
// same words, one inside the other, or nearly all the same words. Short lines ("ok", "thank you") never count: saying
// them twice is normal.

import { fenced } from "./agent-prompt.js";

const MIN_WORDS = 6;
const SAME_SHARE = 0.8;

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word !== "");

/** True when the reply repeats one of the messages sent before (newest first or not: order doesn't matter). */
export function repeatsEarlier(reply: string, sent: readonly string[]): boolean {
  const words = wordsOf(reply);
  if (words.length < MIN_WORDS) return false;
  const joined = words.join(" ");
  const own = new Set(words);
  return sent.some((earlier) => {
    const theirs = wordsOf(earlier);
    if (theirs.length < MIN_WORDS) return false;
    const other = theirs.join(" ");
    if (other.includes(joined) || joined.includes(other)) return true;
    const shared = new Set(theirs.filter((word) => own.has(word))).size;
    return shared / new Set([...own, ...theirs]).size >= SAME_SHARE;
  });
}

/** The messages sent in the chat that a reply is checked against for a repeat. */
export const RECENT_SENT = 10;
/** The team's note when the AI's reply only said again what was sent, so nothing went. */
export const REPEAT_ATTENTION =
  "The AI's reply repeated an earlier message, so it wasn't sent: please answer this customer.";

/** Asks again for a reply that doesn't say again what was sent. */
export const repeatCorrection = (reply: string) =>
  `Your reply repeats a message already sent in this chat:\n<data>${fenced(reply)}</data>\nWrite a different reply that answers their last message in new words and moves the chat forward, as the same ONE JSON object.`;
