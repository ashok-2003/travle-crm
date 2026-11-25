// Which staged actions may end a turn with no words (spec 3.2; ruling 14): a brochure or staying quiet, never a booking
// or the payment details again, which need words.
import type { TurnRun } from "./types.js";

/** The model's actions that end a turn without words: a brochure goes, or nothing should (spec 3.2). */
export const QUIET_ENDERS = ["send_brochure", "stay_quiet"] as const;
/** Payment lines and a QR never go without the model's sentence beside them. */
export const NEEDS_WORDS = ["book", "resend_payment"] as const;

/**
 * Whether a response with no words may end the turn (the lead's ruling, 2026-11-16): a hand-over owes the customer a line
 * (spec 3.5), unless it is for abuse, where silence is right; a hold or a resend needs a sentence; otherwise a brochure
 * or stay_quiet the model staged ends it. Code's own actions never do (pre-flight #14).
 */
export function mayEndSilent(run: Pick<TurnRun, "staged" | "modelStaged">): boolean {
  const handOver = run.staged.get("hand_over");
  if (handOver?.tool === "hand_over" && handOver.reason !== "abuse") return false;
  if (NEEDS_WORDS.some((tool) => run.staged.has(tool))) return false;
  return QUIET_ENDERS.some((tool) => run.modelStaged.has(tool)) || run.modelStaged.has("hand_over");
}
