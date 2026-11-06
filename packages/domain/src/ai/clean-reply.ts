// A reply as the agency's settings allow it (shared by the first agent and the grounded turn): no emoji when it chose none.
import type { AutopilotRow } from "./autopilot.js";

/** Emojis and their parts: pictographs, flags' letters, skin tones, the variation selector, joiners and keycaps. */
const EMOJI = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]|️|‍|⃣/gu;

/** A reply as the agency's settings allow: no emoji at all when it chose none, whatever the model or the voice did. */
export function cleanReply(text: string, settings: Pick<AutopilotRow, "emojis">): string {
  if (settings.emojis !== "none") return text.trim();
  return text
    .replace(EMOJI, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
}
