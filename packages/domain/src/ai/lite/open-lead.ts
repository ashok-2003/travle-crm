// A returning customer writes to a lite agency with every lead closed: once the turn has decided to work on a trip with
// them, and before it sends anything, it opens their new lead through crm's own path for a WhatsApp customer (owner by
// the assignment rules, source WhatsApp), as the team's "Start a new lead" does, so a price told can also be booked. A
// "thanks, great trip!" opens none, and neither does anything from a customer whose newest lead a person marked Not a
// lead (whom the turn answers in nothing). Who owns the agency's leads is read before the transaction, as inbound
// reads it.
import type { OrgTx } from "@travel-crm/db";
import { agencyFactsOf, isBlocked, mayBringIn, startLeadFromChat } from "../../crm/index.js";
import { lockChat } from "../../inbox/index.js";
import { DomainError, systemActor } from "../../kernel/index.js";
import type { LiteDependencies, Move } from "./types.js";

/**
 * The moves that work on a trip, and so need a lead to work on: asking a checklist item, offering or pricing packages,
 * booking, sending the payment details again. A close, silence, a hand-over or a fixed line that only acknowledges
 * (identity, "we don't run that", a screenshot thanked) needs none, and opens none.
 */
export const LEAD_MOVES: ReadonlySet<Move["kind"]> = new Set([
  "greet",
  "answer_package",
  "give_dates",
  "give_price",
  "ask_detail",
  "confirm_place",
  "show_other_trips",
  "book",
  "resend_payment",
]);

/**
 * Whether a person marked the customer's newest lead Not a lead (by hand, or by saying yes to the AI's suggestion). The
 * AI then answers them in nothing at all: it never undoes that by opening a lead on the next "hi", and never hands the
 * chat over or tells anyone. Their lines still reach the inbox, and the team can start a lead by hand.
 */
export async function markedNotALead(tx: OrgTx, personId: string | null): Promise<boolean> {
  if (personId === null) return false;
  const newest = await tx.lead.findFirst({
    where: { personId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { stage: true },
  });
  return newest?.stage === "not_a_lead";
}

/**
 * opened: a lead is open now (this turn's, or one that appeared meanwhile); blocked: no automation answers them;
 * not_a_lead: a person marked their newest lead Not a lead, and only a person starts another.
 */
export type LeadOpening = "opened" | "blocked" | "not_a_lead" | "unable";

export async function openLeadForChat(
  deps: Pick<LiteDependencies, "db" | "identity" | "subscriptions">,
  organizationId: string,
  chat: { id: string; personId: string | null; phoneE164: string },
  now: Date,
): Promise<LeadOpening> {
  const { identity, subscriptions } = deps;
  const { personId } = chat;
  if (personId === null || identity === undefined || subscriptions === undefined) return "unable";
  const agency = { identity, subscriptions };
  // A read-only agency or one without the CRM brings in no lead, as with a new number.
  if (!(await mayBringIn(agency, organizationId))) return "unable";
  const facts = await agencyFactsOf(agency, organizationId);
  if (facts === null) return "unable";
  return deps.db.forOrg(organizationId, async (tx: OrgTx) => {
    // The chat's lock first, as the inbound path takes it, so a line saved meanwhile finds the new lead.
    await lockChat(tx, chat.id);
    if (await isBlocked(tx, { phone: chat.phoneE164 })) return "blocked";
    // Read again under the chat's lock: a person may have marked it since the turn's first read.
    if (await markedNotALead(tx, personId)) return "not_a_lead";
    try {
      await startLeadFromChat(
        tx,
        systemActor(organizationId),
        { personId },
        { ownerUserId: facts.ownerUserId, workers: facts.workers },
        now,
      );
      return "opened";
    } catch (error) {
      if (error instanceof DomainError && error.reason === "OPEN_LEAD_EXISTS") return "opened";
      if (error instanceof DomainError && error.reason === "NOT_FOUND") return "unable";
      throw error;
    }
  });
}
