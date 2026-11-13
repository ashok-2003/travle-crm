// A returning customer writes to a lite agency with every lead closed: before the turn quotes anything, it opens their new
// lead through crm's own path for a WhatsApp customer (owner by the assignment rules, source WhatsApp), as the team's
// "Start a new lead" does, so a price told can also be booked. Who owns the agency's leads is read before the
// transaction, as the inbound path reads it.
import type { OrgTx } from "@travel-crm/db";
import { agencyFactsOf, isBlocked, mayBringIn, startLeadFromChat } from "../../crm/index.js";
import { lockChat } from "../../inbox/index.js";
import { DomainError, systemActor } from "../../kernel/index.js";
import type { LiteDependencies } from "./types.js";

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
