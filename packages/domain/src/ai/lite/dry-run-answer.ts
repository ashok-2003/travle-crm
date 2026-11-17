// What Try it shows of a turn whose decision stands: the words the customer would get (the hand-over's line, the booking's
// message with its payment lines, or the reply) and what code would do next, or the check's code when nothing would go.
import type { TestAiAction, TestAiAnswer, TestAiState } from "@travel-crm/contracts/ai";
import type { Database } from "@travel-crm/db";
import { DomainError } from "../../kernel/index.js";
import { packageFilesIn } from "../../quotes/index.js";
import { handOverSentences } from "./act-words.js";
import { bookingPartsOf, bookingWords } from "./booking-words.js";
import type { DryRunAgency } from "./dry-run-setup.js";
import { fixedText } from "./fixed-texts.js";
import type { Part } from "./reply-parts.js";
import type { Decision, Situation } from "./types.js";

const HOUR_MS = 3_600_000;
type Trace = TestAiAnswer["trace"];

/** A model that gave nothing usable: the month's limit, or the model being down. */
export function ended(reason: string): never {
  if (reason === "limit")
    throw new DomainError("LIMIT_REACHED", "AI_LIMIT_REACHED", "This month's AI calls are used up");
  throw new DomainError("CONFLICT", "AI_UNAVAILABLE", "The AI did not answer; try again");
}

/** Nothing would be sent, for the check's code: the state stays as it came, as a flagged live turn keeps nothing. */
export const blocked = (code: string, state: TestAiState, trace: Trace): TestAiAnswer => ({
  answer: "",
  handoff: false,
  reason: "",
  dryRun: { actions: [], blocked: code },
  state,
  trace,
});

/**
 * What a booking would say: the live turn's own words for the hold and the amount due, with the payment lines under them;
 * or the refusal code the live turn would flag, from the same checks.
 */
function bookingAnswer(
  decision: Decision,
  situation: Situation,
  now: Date,
  agency: DryRunAgency,
): { text: string } | { refused: string } {
  const { move, facts } = decision;
  if (move.kind !== "book") return { refused: "AI_ACTION_REFUSED" };
  const parts = bookingPartsOf({
    decision,
    situation,
    target: move,
    told: facts.quoted,
    paymentReady: agency.paymentLines !== null,
    sellable: agency.index.some((entry) => entry.id === move.packageId),
  });
  if ("refused" in parts) return { refused: parts.refused };
  const holdUntil = new Date(now.getTime() + agency.holdHours * HOUR_MS);
  const text = bookingWords(parts, facts, { holdUntil, today: agency.today, timeZone: agency.timeZone });
  const heading = fixedText("payment_heading", facts.language, {}).text;
  const lines = agency.paymentLines ?? [];
  return { text: [text, ...(lines.length === 0 ? [] : [[heading, ...lines].join("\n")])].join("\n\n") };
}

/** What code would do after the reply: send the newly picked package's files, book, note, add a task. */
async function actionsOf(db: Database, organizationId: string, decision: Decision): Promise<TestAiAction[]> {
  const actions: TestAiAction[] = [];
  const { packageId } = decision.facts;
  if (decision.note === "package_picked" && packageId !== null) {
    const { brochures, photos } = await db.forOrg(organizationId, (tx) => packageFilesIn(tx, packageId));
    if (brochures.length + photos.length > 0) actions.push("files");
  }
  if (decision.move.kind === "book") actions.push("book");
  if (decision.note !== null) actions.push("note");
  if (decision.task !== null) actions.push("task");
  return actions;
}

/** The turn's answer by its move, with what code would do, the next turn's state (`next`, or `kept` when nothing goes). */
export async function answerOf(
  db: Database,
  organizationId: string,
  turn: { decision: Decision; reply: Part | null; situation: Situation; now: Date; agency: DryRunAgency },
  carry: { kept: TestAiState; next: TestAiState; trace: Trace },
): Promise<TestAiAnswer> {
  const { decision } = turn;
  const { move } = decision;
  const actions = await actionsOf(db, organizationId, decision);
  const done = (answer: string, handoff: boolean, reason: string): TestAiAnswer => ({
    answer,
    handoff,
    reason,
    dryRun: { actions, blocked: null },
    state: carry.next,
    trace: carry.trace,
  });
  if (move.kind === "hand_over") {
    const line = fixedText(move.reason === "voice_note" ? "voice_note" : "hand_over", decision.facts.language, {});
    return done(line.text, true, handOverSentences[move.reason]);
  }
  if (move.kind === "silent") return done("", false, "");
  if (move.kind === "book") {
    const booking = bookingAnswer(decision, turn.situation, turn.now, turn.agency);
    return "refused" in booking ? blocked(booking.refused, carry.kept, carry.trace) : done(booking.text, false, "");
  }
  if (move.kind === "resend_payment") return blocked("AI_ACTION_REFUSED", carry.kept, carry.trace);
  return done(turn.reply?.text ?? "", false, "");
}
