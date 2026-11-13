// A returning customer writes to a lite agency with every lead closed: once the turn has decided to work on a trip with
// them, and before it sends anything, it opens their new lead through crm's own path for a WhatsApp customer (owner by
// the assignment rules, source WhatsApp), as the team's "Start a new lead" does, so a price told can also be booked. A
// "thanks, great trip!" opens none. Who owns the agency's leads is read before the transaction, as inbound reads it.
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

/** opened: a lead is open now (this turn's, or one that appeared meanwhile); blocked: no automation answers them. */
export type LeadOpening = "opened" | "blocked" | "unable";

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
