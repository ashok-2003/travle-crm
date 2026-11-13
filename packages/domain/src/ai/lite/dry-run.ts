// "Try it" for an agency on the lite agent: the lite turn as a dry run on one question, as if a customer wrote it in a
// new chat with no lead (understand, look up, decide, write, check). Nothing is sent, held, booked or kept; only the
// month's usage is written, since each model call counts against the limit as a turn's do. Setup need not be finished.
import { liteFacts, type TestAiAction, type TestAiAnswer } from "@travel-crm/contracts/ai";
import type { Database } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import { departureSettingsOf } from "../../departures/index.js";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { calendarDateIn, DomainError, type CalendarDate } from "../../kernel/index.js";
import { agencyPaymentDetailsOf, paymentDetailsReady, paymentLinesOf } from "../../profile/index.js";
import { packageFilesIn, sellablePackages } from "../../quotes/index.js";
import { agencyAnswersOf, agentBasicsOf } from "../agency-answers.js";
import { countedCall, type CallEnvironment } from "./counted-call.js";
import { handOverSentences } from "./act-words.js";
import { actingOn, codeWordsOf } from "./act-reply.js";
import { checkedForm } from "./form-check.js";
import { bookingPartsOf, bookingWords } from "./booking-words.js";
import { fixedText } from "./fixed-texts.js";
import { mergeForm } from "./merge.js";
import { packageIndexOf } from "./prepare-lead.js";
import { placesOf } from "./prepare.js";
import { understandRequest } from "./prompts/understand-prompt.js";
import { decideBase } from "./turn.js";
import { decided, written } from "./turn-steps.js";
import type { Decision, PackageIndexEntry, Situation } from "./types.js";
import { understandChat } from "./understand.js";

const HOUR_MS = 3_600_000;

/** A model that gave nothing usable: the month's limit, or the model being down. */
function ended(reason: string): never {
  if (reason === "limit")
    throw new DomainError("LIMIT_REACHED", "AI_LIMIT_REACHED", "This month's AI calls are used up");
  throw new DomainError("CONFLICT", "AI_UNAVAILABLE", "The AI did not answer; try again");
}

const blocked = (code: string): TestAiAnswer => ({
  answer: "",
  handoff: false,
  reason: "",
  grounded: { actions: [], blocked: code },
});

/**
 * What a booking would say: the live turn's own words for the hold and the amount due, with the payment lines under them;
 * or the refusal code the live turn would flag, from the same checks.
 */
function bookingAnswer(
  decision: Decision,
  situation: Situation,
  context: { now: Date; today: CalendarDate; timeZone: string; index: readonly PackageIndexEntry[] },
  money: { holdHours: number; paymentLines: string[] | null },
): { text: string } | { refused: string } {
  const { move, facts } = decision;
  if (move.kind !== "book") return { refused: "AI_ACTION_REFUSED" };
  const parts = bookingPartsOf({
    decision,
    situation,
    target: move,
    told: facts.quoted,
    paymentReady: money.paymentLines !== null,
    sellable: context.index.some((entry) => entry.id === move.packageId),
  });
  if ("refused" in parts) return { refused: parts.refused };
  const holdUntil = new Date(context.now.getTime() + money.holdHours * HOUR_MS);
  const text = bookingWords(parts, facts, { holdUntil, today: context.today, timeZone: context.timeZone });
  const heading = fixedText("payment_heading", facts.language, {}).text;
  const lines = money.paymentLines ?? [];
  return { text: [text, ...(lines.length === 0 ? [] : [[heading, ...lines].join("\n")])].join("\n\n") };
}

export async function liteDryRun(
  deps: { db: Database; ai: AiModel; agencyName: (organizationId: string) => Promise<string> },
  access: MemberAccess,
  question: string,
  now: Date,
): Promise<TestAiAnswer> {
  const { db, ai } = deps;
  const { organizationId } = access;
  const agencyName = await deps.agencyName(organizationId);
  const prepared = await db.forOrg(organizationId, async (tx) => {
    const timeZone = await organizationTimeZone(tx, organizationId);
    const today = calendarDateIn(now, timeZone);
    const index = await packageIndexOf(tx, await sellablePackages(tx, organizationId, today), today, now);
    const basics = await agentBasicsOf(tx);
    const payment = await agencyPaymentDetailsOf(tx, organizationId);
    return {
      timeZone,
      today,
      index,
      places: await placesOf(tx, index),
      basics: {
        agentName: basics.agentName,
        tone: basics.tone === "professional" ? ("professional" as const) : ("friendly" as const),
      },
      answers: await agencyAnswersOf(tx),
      holdHours: (await departureSettingsOf(tx)).holdHours,
      paymentLines: paymentDetailsReady(payment) ? paymentLinesOf(payment) : null,
    };
  });
  const messages = [{ id: "dry-run", from: "customer" as const, at: now, kind: "text", text: question }];
  const facts = liteFacts.parse({ agent: "lite" });
  const environment: CallEnvironment = { db, organizationId, now, timeZone: prepared.timeZone };
  const asking = understandRequest({
    agencyName,
    packages: prepared.index,
    now,
    today: prepared.today,
    timeZone: prepared.timeZone,
    lead: null,
    summary: "",
    timeline: [],
    messages,
  });
  const asked = await countedCall(environment, () => understandChat(ai, asking.request));
  if (!asked.ok) return asked.reason === "unfit" ? blocked("unfit") : ended(asked.reason);
  const checked = checkedForm(asked.form, messages, messages, prepared.index, prepared.today);
  const merged = mergeForm(facts, checked, prepared.index);
  const base = decideBase(
    {
      burst: messages,
      facts,
      index: prepared.index,
      adPackageId: null,
      openBooking: null,
      hasBooking: false,
      mayBePayment: false,
      nameUsable: false,
      leadStage: null,
      places: prepared.places,
    },
    { organizationId, conversationId: "dry-run", kind: "reply", token: "dry-run" },
    checked,
    merged,
  );
  const { situation, decision } = await decided(
    db,
    organizationId,
    base,
    { index: prepared.index, answers: prepared.answers, facts: merged, today: prepared.today, now },
    checked.form.lookups,
  );
  const words = await written(
    ai,
    environment,
    { ...prepared, messages, sent: [] },
    { decision, situation, agencyName, summary: checked.form.summary },
  );
  if (words?.written.kind === "refused") return blocked(words.written.code);
  if (words?.written.kind === "ended") ended(words.written.outcome);
  const code = codeWordsOf(decision, situation, decision.facts.language, agencyName, prepared.today);
  const acting = actingOn(decision, code, words?.written ?? null);
  if ("ended" in acting) return ended(acting.ended);
  const { move } = acting.decision;
  const actions: TestAiAction[] = [];
  if (acting.decision.note === "package_picked" && acting.decision.facts.packageId !== null) {
    const { brochures, photos } = await db.forOrg(organizationId, (tx) =>
      packageFilesIn(tx, acting.decision.facts.packageId ?? ""),
    );
    if (brochures.length + photos.length > 0) actions.push("files");
  }
  if (move.kind === "book") actions.push("book");
  if (acting.decision.note !== null) actions.push("note");
  if (acting.decision.task !== null) actions.push("task");
  const done = (answer: string, handoff: boolean, reason: string): TestAiAnswer => ({
    answer,
    handoff,
    reason,
    grounded: { actions, blocked: null },
  });
  if (move.kind === "hand_over") {
    const line = fixedText(
      move.reason === "voice_note" ? "voice_note" : "hand_over",
      acting.decision.facts.language,
      {},
    );
    return done(line.text, true, handOverSentences[move.reason]);
  }
  if (move.kind === "silent") return done("", false, "");
  if (move.kind === "book") {
    const booking = bookingAnswer(
      acting.decision,
      situation,
      { now, today: prepared.today, timeZone: prepared.timeZone, index: prepared.index },
      prepared,
    );
    return "refused" in booking ? blocked(booking.refused) : done(booking.text, false, "");
  }
  if (move.kind === "resend_payment") return blocked("AI_ACTION_REFUSED");
  return done(acting.reply?.text ?? "", false, "");
}
