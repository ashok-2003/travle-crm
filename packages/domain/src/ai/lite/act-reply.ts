// What the act step is handed once Write has answered: the move's words (code's own, then the model's), or a hand-over
// when no safe words came. A move never goes out silent for want of words, and a fixed text that cannot be filled never
// throws out of the turn.
import type { LiteLanguage } from "@travel-crm/contracts/ai";
import type { CalendarDate } from "../../kernel/index.js";
import { composeReply, fixedPartOf, type Part } from "./reply-parts.js";
import type { Decision, HandOverReason, Move, Situation } from "./types.js";
import type { LiteWritten } from "./write.js";

/** The moves whose words act writes itself, from the fixed texts: Write never sees them. */
export const actWrites: ReadonlySet<Move["kind"]> = new Set(["book", "resend_payment", "hand_over", "silent"]);

/** The move's code-written words. A not_run with no place in the facts has none: a hand-over follows, never a throw. */
export function codeWordsOf(
  decision: Decision,
  situation: Situation,
  language: LiteLanguage,
  agencyName: string,
  today: CalendarDate,
): Part | null {
  try {
    return fixedPartOf(decision.move, situation, decision.facts, language, agencyName, today);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/**
 * The decision with its move turned into a hand-over. Nothing it would have said goes, so no price counts as told and
 * the lead moves no further than Contacted; its question is not waiting for an answer either.
 */
export function handOverInstead(decision: Decision, reason: HandOverReason, why: string): Decision {
  const { move, facts } = decision;
  const toldPrice = move.kind === "give_price" && move.price === "full";
  return {
    ...decision,
    move: { kind: "hand_over", reason },
    why,
    note: "handed_over",
    stageTo: decision.stageTo === null ? null : "contacted",
    facts: { ...facts, quoted: toldPrice ? null : facts.quoted, asked: [], lastMove: "hand_over" },
  };
}

export type Acting = { decision: Decision; reply: Part | null } | { ended: string };

/**
 * Write's outcome (null when the model was not asked: `writeMoveOf` had nothing for it) folded with code's own words.
 * cannot_answer hands over as unanswered, refused as check_failed; a model that could not be asked leaves code's words
 * alone, else ends the turn with its outcome; no words at all hand over as unanswered.
 */
export function actingOn(decision: Decision, code: Part | null, written: LiteWritten | null): Acting {
  if (actWrites.has(decision.move.kind)) return { decision, reply: null };
  if (written?.kind === "cannot_answer") {
    return { decision: handOverInstead(decision, "unanswered", "write:cannot_answer"), reply: null };
  }
  if (written?.kind === "refused") {
    return { decision: handOverInstead(decision, "check_failed", `write:${written.code}`), reply: null };
  }
  if (written?.kind === "ended") return code === null ? { ended: written.outcome } : { decision, reply: code };
  const reply = composeReply([code, written?.kind === "ok" ? written : null]);
  if (reply.text.trim() === "") {
    return { decision: handOverInstead(decision, "unanswered", "write:nothing"), reply: null };
  }
  return { decision, reply };
}
