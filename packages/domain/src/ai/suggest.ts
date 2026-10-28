// Suggest reply: the AI drafts the next reply in a chat, for the member to read, change and send. It never sends. Three
// short transactions around the model's answer, so no database connection waits on the provider: first the checks (the
// agency's switch, the member's chat, the monthly limit) and what the prompt needs; then the model; then the draft's row,
// or the suggestion given back when the AI didn't answer. The words of the draft are kept nowhere: the row has ids and a hash.
import { createHash } from "node:crypto";
import type { SuggestedReply, SuggestReplyInput } from "@travel-crm/contracts/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import { getLead } from "../crm/index.js";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { listQuickReplies, tripKitWords, visibleConversation } from "../inbox/index.js";
import { DomainError } from "../kernel/index.js";
import { promptOf, type PromptFacts } from "./prompt.js";
import { aiEnabled } from "./settings.js";
import { MONTHLY_SUGGESTION_LIMIT, releaseSuggestion, reserveSuggestion, usedThisMonth } from "./usage.js";

const CHAT_MESSAGES = 12;
const MAX_REPLY_CHARS = 1500;
const OPEN_STAGES = ["new", "contacted", "quote_sent", "booking_requested"];

export const hashOf = (text: string) => createHash("sha256").update(text.trim()).digest("hex");

const err = (reason: string, message: string, code: "CONFLICT" | "LIMIT_REACHED" = "CONFLICT") =>
  new DomainError(code, reason, message);

/** The lead's facts as short lines, with no contact details. */
async function leadFacts(tx: OrgTx, access: MemberAccess, personId: string | null): Promise<string[]> {
  if (personId === null) return [];
  const row = await tx.lead.findFirst({
    where: { personId, stage: { in: OPEN_STAGES } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (row === null) return [];
  const lead = await getLead(tx, access, row.id).catch(() => null);
  if (lead === null) return [];
  const { trip } = lead;
  const when =
    trip.when.kind === "dates"
      ? `${trip.when.from} to ${trip.when.to}`
      : trip.when.kind === "month"
        ? trip.when.month
        : trip.when.kind;
  return [
    `Stage: ${lead.stage}`,
    trip.destination === null ? "" : `Destination: ${trip.destination.name}`,
    `When: ${when}`,
    trip.adults === null ? "" : `Adults: ${String(trip.adults)}`,
    trip.childrenAges.length === 0 ? "" : `Children: ${String(trip.childrenAges.length)}`,
    trip.departureCity === null ? "" : `Travelling from: ${trip.departureCity}`,
    trip.tripType === null ? "" : `Trip type: ${trip.tripType}`,
    trip.hotelCategory === null ? "" : `Hotel: ${trip.hotelCategory}`,
    trip.food === null ? "" : `Food: ${trip.food}`,
  ].filter((line) => line !== "");
}

interface Prepared {
  facts: PromptFacts;
  timeZone: string;
}

async function prepare(
  tx: OrgTx,
  access: MemberAccess,
  input: SuggestReplyInput,
  context: { agencyName: string; now: Date },
): Promise<Prepared> {
  if (!(await aiEnabled(tx))) {
    throw err("AI_OFF", "The AI is off for this agency: an Owner or Admin turns it on in Settings, AI");
  }
  // The member's own scope: a chat they may not see is "not found".
  const chat = await visibleConversation(tx, access, input.conversationId);
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  if (!(await reserveSuggestion(tx, context.now, timeZone))) {
    throw err("AI_MONTH_LIMIT", "This agency has used this month's AI suggestions", "LIMIT_REACHED");
  }
  const recent = await tx.whatsappMessage.findMany({
    where: { conversationId: chat.id, OR: [{ body: { not: null } }, { caption: { not: null } }] },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: CHAT_MESSAGES,
    select: { direction: true, body: true, caption: true },
  });
  const settings = await tx.aiSettings.findFirstOrThrow({ select: { instructions: true } });
  const [quickReplies, tripKits, lead] = await Promise.all([
    listQuickReplies(tx),
    tripKitWords(tx),
    leadFacts(tx, access, chat.personId),
  ]);
  const firstName = chat.person?.name.split(/\s+/)[0] ?? null;
  return {
    timeZone,
    facts: {
      agencyName: context.agencyName,
      instructions: settings.instructions,
      firstName: firstName === "" ? null : firstName,
      lead,
      tripKits,
      quickReplies: quickReplies.slice(0, 20).map((reply) => ({ title: reply.title, body: reply.body })),
      chat: recent
        .reverse()
        .map((message) => ({ fromCustomer: message.direction === "in", text: message.body ?? message.caption ?? "" })),
    },
  };
}

/**
 * Drafts a reply. Refused when the agency has the AI off, the chat is not the member's, the month's limit is used, or the
 * AI doesn't answer (the suggestion is then given back). The plan's module and the member's permission are the router's.
 */
export async function suggestReply(
  db: Database,
  model: AiModel,
  access: MemberAccess,
  input: SuggestReplyInput,
  context: { agencyName: string; now: Date },
): Promise<SuggestedReply> {
  const { organizationId } = access;
  if (!model.configured) {
    throw err("AI_NOT_READY", "The AI isn't set up on this server yet", "CONFLICT");
  }
  const prepared = await db.forOrg(organizationId, (tx) => prepare(tx, access, input, context));
  const result = await model.complete({
    feature: "suggest_reply",
    messages: promptOf(prepared.facts),
    maxTokens: 500,
    // Opaque: the agency's id, never a person's.
    user: organizationId,
  });
  if (!result.ok) {
    await db.forOrg(organizationId, (tx) => releaseSuggestion(tx, context.now, prepared.timeZone));
    throw result.reason === "rate_limited"
      ? err("AI_BUSY", "The AI is busy right now")
      : result.reason === "not_configured"
        ? err("AI_NOT_READY", "The AI isn't set up on this server yet")
        : err("AI_UNAVAILABLE", "The AI didn't answer");
  }
  const text = result.text
    .trim()
    .replace(/^["“](.*)["”]$/s, "$1")
    .trim()
    .slice(0, MAX_REPLY_CHARS);
  const saved = await db.forOrg(organizationId, async (tx) => {
    const draft = await tx.aiDraft.create({
      data: {
        conversationId: input.conversationId,
        draftedBy: access.userId,
        model: result.model,
        textHash: hashOf(text),
      },
      select: { id: true },
    });
    return { draftId: draft.id, usedThisMonth: await usedThisMonth(tx, context.now, prepared.timeZone) };
  });
  return { ...saved, text, monthlyLimit: MONTHLY_SUGGESTION_LIMIT };
}
