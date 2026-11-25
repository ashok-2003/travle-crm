// The agent's suggestion to mark a lead Lost or Not a lead, kept for a person to decide. The agent never moves the
// lead itself: its act writes the suggestion, the lead's page (or the AI page's "Needs you" list) shows it, and only a
// person's yes calls moveLeadStage, as that person.
import { lostReason as lostReasonSchema, type LeadStage, type LostReason } from "@travel-crm/contracts/crm";
import type { DecideStageSuggestionInput, NeedsMeInput, StageSuggestion } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import { isLeadInScope, lockLead, moveLeadStage } from "../../crm/index.js";
import { scopeFilter, type MemberAccess } from "../../identity/index.js";
import { DomainError, systemActor } from "../../kernel/index.js";

type Kind = "lost" | "not_a_lead";
const REASON_MAX = 200;
const LIST_MAX = 20;

/**
 * The stages a lead can be marked Lost or Not a lead from on the AI's word: before the customer asked to book. Past
 * that a person is in the middle of a sale and the AI's reading of one line is not enough to close it.
 */
const suggestable: readonly LeadStage[] = ["new", "contacted", "quote_sent"];

/**
 * Adds a suggestion to the lead. Nothing is added when the lead is not in an open stage, already has an open
 * suggestion, or a person turned down one of this kind. Returns whether one was added.
 */
export async function suggestStage(
  tx: OrgTx,
  input: {
    organizationId: string;
    leadId: string;
    conversationId: string;
    kind: Kind;
    lostReason: LostReason | null;
    reason: string;
    now: Date;
  },
): Promise<boolean> {
  // The lead's lock first, so two turns racing for one lead take turns and the second sees the first's row.
  const locked = await lockLead(tx, input.leadId);
  if (!suggestable.includes(locked.stage)) return false;
  const earlier = await tx.leadAiSuggestion.findMany({
    where: { leadId: input.leadId, OR: [{ state: "open" }, { kind: input.kind, state: "declined" }] },
    select: { id: true },
    take: 1,
  });
  if (earlier.length > 0) return false;
  await tx.leadAiSuggestion.create({
    data: {
      leadId: input.leadId,
      conversationId: input.conversationId,
      kind: input.kind,
      lostReason: input.lostReason,
      reason: input.reason.slice(0, REASON_MAX),
      createdAt: input.now,
    },
  });
  await recordAudit(tx, systemActor(input.organizationId), {
    action: "ai.stage-suggested",
    entityType: "lead",
    entityId: input.leadId,
    after: { kind: input.kind },
  });
  return true;
}

const columns = {
  id: true,
  leadId: true,
  kind: true,
  lostReason: true,
  reason: true,
  createdAt: true,
  lead: { select: { person: { select: { name: true } } } },
} as const;

interface Row {
  id: string;
  leadId: string;
  kind: string;
  lostReason: string | null;
  reason: string;
  createdAt: Date;
  lead: { person: { name: string } };
}

function viewOf(row: Row): StageSuggestion {
  return {
    id: row.id,
    leadId: row.leadId,
    name: row.lead.person.name,
    kind: row.kind === "not_a_lead" ? "not_a_lead" : "lost",
    lostReason: row.lostReason === null ? null : lostReasonSchema.parse(row.lostReason),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The leads the AI's needs are about, as a lead filter: live leads in the member's leads scope; `mine` keeps the ones
 * the member owns and, for someone who manages the AI, the ones nobody owns.
 */
export function leadsTheAiNeedsAbout(access: MemberAccess, mine: boolean) {
  const owners = access.permissions.has("ai:manage") ? [access.userId, null] : [access.userId];
  return {
    deletedAt: null,
    ...scopeFilter(access, "leads:view", "ownerUserId"),
    ...(mine ? { OR: owners.map((ownerUserId) => ({ ownerUserId })) } : {}),
  };
}

/** The open suggestions on the open leads leadsTheAiNeedsAbout covers: "Needs you" and the Leads list's Show alike. */
export function openSuggestionsWhere(access: MemberAccess, mine: boolean) {
  return { state: "open", lead: { ...leadsTheAiNeedsAbout(access, mine), stage: { in: [...suggestable] } } };
}

/** How many open suggestions there are (openSuggestionsWhere): every one, where the list shows the newest 20. */
export function countOpenSuggestions(tx: OrgTx, access: MemberAccess, { mine }: NeedsMeInput): Promise<number> {
  return tx.leadAiSuggestion.count({ where: openSuggestionsWhere(access, mine) });
}

/** The open suggestions (openSuggestionsWhere), newest first, 20 at most. */
export async function stageSuggestionsOf(
  tx: OrgTx,
  access: MemberAccess,
  { mine }: NeedsMeInput,
): Promise<StageSuggestion[]> {
  const rows = await tx.leadAiSuggestion.findMany({
    where: openSuggestionsWhere(access, mine),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LIST_MAX,
    select: columns,
  });
  return rows.map(viewOf);
}

/** The lead's open suggestion, when the lead is open and in the member's scope; otherwise none. */
export async function stageSuggestionOfLead(
  tx: OrgTx,
  access: MemberAccess,
  leadId: string,
): Promise<StageSuggestion | null> {
  const row = await tx.leadAiSuggestion.findFirst({
    where: {
      leadId,
      state: "open",
      lead: { deletedAt: null, stage: { in: [...suggestable] }, ...scopeFilter(access, "leads:view", "ownerUserId") },
    },
    select: columns,
  });
  return row === null ? null : viewOf(row);
}

/**
 * A person's yes or no. Yes moves the lead as the person would, from its page; a lead that has moved on since is left
 * alone and the suggestion is closed as declined. The chat's AI is left as it is: a Not a lead silences the customer
 * through their newest lead (`markedNotALead`), which lifts by itself when the team starts them a new one. An unknown or
 * decided suggestion, or a lead outside the member's scope, is NOT_FOUND.
 */
export async function decideStageSuggestion(
  tx: OrgTx,
  access: MemberAccess,
  input: DecideStageSuggestionInput,
  now: Date,
): Promise<void> {
  const suggestion = await tx.leadAiSuggestion.findFirst({
    where: { id: input.suggestionId, state: "open" },
    select: { id: true, leadId: true, kind: true, lostReason: true },
  });
  if (suggestion === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such suggestion");
  const lead = await lockLead(tx, suggestion.leadId);
  if (!isLeadInScope(access, lead.ownerUserId)) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such suggestion");
  const moves = input.accept && suggestable.includes(lead.stage);
  // Closed first, under the lead's lock: a decision that lost the race to another member finds it already closed.
  const closed = await tx.leadAiSuggestion.updateMany({
    where: { id: suggestion.id, state: "open" },
    data: { state: moves ? "accepted" : "declined", decidedBy: access.userId, decidedAt: now },
  });
  if (closed.count === 0) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such suggestion");
  if (moves) {
    const stage: Kind = suggestion.kind === "not_a_lead" ? "not_a_lead" : "lost";
    await moveLeadStage(
      tx,
      access,
      {
        leadId: suggestion.leadId,
        stage,
        lostReason: suggestion.lostReason === null ? undefined : lostReasonSchema.parse(suggestion.lostReason),
      },
      now,
    );
  }
  const about = { entityType: "lead", entityId: suggestion.leadId, after: { kind: suggestion.kind } };
  if (moves) await recordAudit(tx, access, { action: "ai.stage-suggestion-accepted", ...about });
  else await recordAudit(tx, access, { action: "ai.stage-suggestion-declined", ...about });
}
