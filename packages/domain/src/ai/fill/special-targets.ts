// The two fills that are not a form's plain keys (release ai3): "Draft the days" for a quote, and travellers' details for a
// booking. Each checks its subject, says what the model is asked, and turns the answer into a proposal. The engine does the
// rest the same for every target: one monthly call, the model, the fill's row, the call given back when nothing came.
import { draftAnswer, travellersAnswer, type AiFillField, type AiFillInput } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import type { AiFeature, AiMessage, AiPart } from "@travel-crm/integrations/ai";
import { assertOpen, findBookingInScope } from "../../bookings/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";
import { getQuote } from "../../quotes/index.js";
import { gatherDraftFacts, resolveDraftDays } from "./draft-days.js";
import { draftDaysPrompt } from "./draft-days-prompt.js";
import { jsonObjectIn } from "./json.js";
import type { Resolved } from "./resolve.js";
import { resolveTravellers } from "./travellers-resolve.js";
import { travellersPrompt } from "./travellers-prompt.js";

type Special = Extract<AiFillInput["target"], "quote_days" | "travellers">;

/** What the engine needs from a special target before it asks the model. */
export interface SpecialPrepared {
  /** The record the fill belongs to (a booking's fill belongs to its lead, so a customer's erasure finds it). */
  subject: { type: "lead" | "quote"; id: string };
  feature: AiFeature;
  maxTokens: number;
  messages(attachments: readonly AiPart[], words: string): AiMessage[];
  /** Turns the model's text into fields and questions, in the same transaction that writes the fill's row. */
  resolve(text: string, from: AiFillField["from"]): Resolved;
}

export const isSpecial = (target: AiFillInput["target"]): target is Special =>
  target === "quote_days" || target === "travellers";

const refuse = (reason: string, message: string) => new DomainError("VALIDATION", reason, message);

/** Quote days: the quote is the member's, a draft, and the trip's length is known. Nothing is read from a chat. */
async function prepareDays(
  tx: OrgTx,
  access: MemberAccess,
  input: AiFillInput,
  words: string,
): Promise<SpecialPrepared> {
  if (input.subjectId === undefined) throw refuse("SUBJECT_REQUIRED", "Say which quote");
  const quote = await getQuote(tx, access, input.subjectId);
  if (quote.status !== "draft") throw refuse("QUOTE_NOT_WRITABLE", "Only a draft quote's days can be drafted");
  const gathered = await gatherDraftFacts(tx, access, quote, words);
  return {
    subject: { type: "quote", id: quote.id },
    feature: "draft_days",
    maxTokens: 3000,
    messages: () => draftDaysPrompt(gathered.facts),
    resolve(text) {
      const json = jsonObjectIn(text);
      const answer = draftAnswer.parse(json ?? {});
      const days = resolveDraftDays(answer, gathered.dayCount, answer.questions ?? [], gathered.labels);
      // A day plan taken from the agency's own packages says which, so staff can see where its places came from.
      const usedPackages = gathered.packageNames.length > 0;
      const source = gathered.packageNames.join(", ").slice(0, 200);
      return {
        fields:
          days.days.length === 0
            ? []
            : [
                {
                  path: "quote.days",
                  value: days.days,
                  from: usedPackages ? ("package" as const) : ("text" as const),
                  excerpt: source,
                  ...(usedPackages ? { itemHints: days.hints } : {}),
                },
              ],
        questions: days.questions,
        removedAmounts: days.removedAmounts,
      };
    },
  };
}

/** Travellers: the booking is the member's and open; their rows are what the people are matched to. */
async function prepareTravellers(
  tx: OrgTx,
  access: MemberAccess,
  input: AiFillInput,
  today: string,
): Promise<SpecialPrepared> {
  if (input.subjectId === undefined) throw refuse("SUBJECT_REQUIRED", "Say which booking");
  const booking = await findBookingInScope(tx, access, input.subjectId);
  assertOpen(booking);
  const rows = await tx.bookingTraveller.findMany({
    where: { bookingId: booking.id },
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });
  const mayReadIds = access.permissions.has("documents:view_sensitive");
  return {
    subject: { type: "lead", id: booking.leadId },
    feature: "fill_form",
    maxTokens: 2500,
    messages: (attachments, words) => travellersPrompt({ today, text: words, attachments }),
    resolve(text, from) {
      const answer = travellersAnswer.parse(jsonObjectIn(text) ?? {});
      return { ...resolveTravellers(answer, { today, rows, mayReadIds, from }), removedAmounts: false };
    },
  };
}

export function prepareSpecial(
  tx: OrgTx,
  access: MemberAccess,
  input: AiFillInput,
  context: { words: string; today: string },
): Promise<SpecialPrepared> {
  return input.target === "quote_days"
    ? prepareDays(tx, access, input, context.words)
    : prepareTravellers(tx, access, input, context.today);
}
