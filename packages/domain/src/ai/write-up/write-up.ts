// The quote write-up: the AI writes a message for the customer about a quote, for the member to read, change and use. It
// never sends. Three short transactions around the model's answer, as Suggest reply has: the checks, one monthly call and
// what the prompt needs; the model; then, when the customer has a chat the member may use, a draft row that audits the send
// ("drafted by AI"). The words are kept nowhere. The quote's total and advance are put in by code and an amount the model
// typed is taken out.
import type { WriteUp, WriteUpInput } from "@travel-crm/contracts/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import { organizationTimeZone, type MemberAccess } from "../../identity/index.js";
import { visibleConversations } from "../../inbox/index.js";
import { DomainError, formatMoney, money } from "../../kernel/index.js";
import { getQuote } from "../../quotes/index.js";
import { hashOf } from "../suggest.js";
import { knowledgeWords } from "../knowledge.js";
import { aiEnabled } from "../settings.js";
import { MONTHLY_AI_LIMIT, recordTokens, releaseAiCall, reserveAiCall, usedThisMonth } from "../usage.js";
import { writeUpPrompt, type WriteUpFacts } from "./prompt.js";
import { fillTokens, withoutTypedAmounts } from "./tokens.js";

const MAX_CHARS = 3000;

const refuse = (reason: string, message: string, code: "CONFLICT" | "LIMIT_REACHED" | "VALIDATION" = "CONFLICT") =>
  new DomainError(code, reason, message);

interface Prepared {
  timeZone: string;
  facts: WriteUpFacts;
  quote: Awaited<ReturnType<typeof getQuote>>;
  conversationId: string | null;
}

/** The customer's most recent open chat, when the member may reply in it. */
async function chatOf(tx: OrgTx, access: MemberAccess, leadId: string): Promise<string | null> {
  if (!access.permissions.has("inbox:view") || !access.permissions.has("inbox:reply")) return null;
  const lead = await tx.lead.findFirst({ where: { id: leadId }, select: { personId: true } });
  if (lead === null) return null;
  const chat = await tx.whatsappConversation.findFirst({
    where: { personId: lead.personId, hidden: false, state: "open", ...visibleConversations(access) },
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    select: { id: true },
  });
  return chat?.id ?? null;
}

async function prepare(
  tx: OrgTx,
  access: MemberAccess,
  input: WriteUpInput,
  context: { agencyName: string; now: Date },
): Promise<Prepared> {
  if (!(await aiEnabled(tx))) {
    throw refuse("AI_OFF", "The AI is off for this agency: an Owner or Admin turns it on in Settings, AI");
  }
  // The member's own scope: a quote out of it is "not found".
  const quote = await getQuote(tx, access, input.quoteId);
  if (quote.status === "replaced" || quote.status === "declined") {
    throw refuse("QUOTE_NOT_WRITABLE", "This quote is no longer open", "VALIDATION");
  }
  if (quote.days.length === 0) {
    throw refuse("QUOTE_HAS_NO_DAYS", "Add the day-by-day plan to the quote first", "VALIDATION");
  }
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  if (!(await reserveAiCall(tx, context.now, timeZone))) {
    throw refuse("AI_MONTH_LIMIT", "This agency has used this month's AI suggestions", "LIMIT_REACHED");
  }
  const settings = await tx.aiSettings.findFirstOrThrow({ select: { instructions: true, writeStyle: true } });
  const knowledge = await knowledgeWords(tx);
  const conversationId = await chatOf(tx, access, quote.leadId);
  const firstName = quote.customerName.trim().split(/\s+/)[0] ?? "";
  const style = settings.writeStyle === "premium" || settings.writeStyle === "short" ? settings.writeStyle : "warm";
  return {
    timeZone,
    quote,
    conversationId,
    facts: {
      agencyName: context.agencyName,
      instructions: settings.instructions,
      knowledge,
      style,
      language: input.language,
      channel: input.channel,
      firstName: firstName === "" ? null : firstName,
      quote: {
        title: quote.title,
        startDate: quote.startDate,
        adults: quote.adults,
        children: quote.children,
        days: quote.days,
        // The lines' descriptions only: a unit price is never shown to the model.
        items: quote.items.map(({ description, detail, quantity }) => ({ description, detail, quantity })),
        inclusions: quote.inclusions,
        exclusions: quote.exclusions,
        notes: quote.notes,
      },
    },
  };
}

/**
 * Writes a quote up. Refused when the AI is off, the quote is not the member's, is closed or has no days, the month's limit
 * is used, or the AI doesn't answer (the call is then given back). The plan's module and the permissions are the router's.
 */
export async function writeUpQuote(
  db: Database,
  model: AiModel,
  access: MemberAccess,
  input: WriteUpInput,
  context: { agencyName: string; now: Date },
): Promise<WriteUp> {
  const { organizationId } = access;
  if (!model.configured) throw refuse("AI_NOT_READY", "The AI isn't set up on this server yet");
  const prepared = await db.forOrg(organizationId, (tx) => prepare(tx, access, input, context));
  const giveBack = () => db.forOrg(organizationId, (tx) => releaseAiCall(tx, context.now, prepared.timeZone));
  const result = await model.complete({
    feature: "write_up",
    messages: writeUpPrompt(prepared.facts),
    maxTokens: 1200,
    // Opaque: the agency's id, never a person's.
    user: organizationId,
  });
  if (!result.ok) {
    await giveBack();
    throw result.reason === "rate_limited"
      ? refuse("AI_BUSY", "The AI is busy right now")
      : result.reason === "not_configured"
        ? refuse("AI_NOT_READY", "The AI isn't set up on this server yet")
        : refuse("AI_UNAVAILABLE", "The AI didn't answer");
  }
  const typed = withoutTypedAmounts(result.text.trim().replace(/^["“](.*)["”]$/s, "$1"));
  const { quote } = prepared;
  const advance = quote.installments[0];
  const text = fillTokens(typed.text, {
    total: formatMoney(money(quote.totals.totalPaise)),
    advance: advance === undefined ? null : formatMoney(money(advance.amountPaise)),
    hasLink: quote.status !== "draft",
  }).slice(0, MAX_CHARS);
  if (text === "") {
    await giveBack();
    throw refuse("AI_UNAVAILABLE", "The AI didn't answer");
  }
  const saved = await db.forOrg(organizationId, async (tx) => {
    await recordTokens(tx, context.now, prepared.timeZone, { input: result.inputTokens, output: result.outputTokens });
    const draft =
      prepared.conversationId === null
        ? null
        : await tx.aiDraft.create({
            data: {
              conversationId: prepared.conversationId,
              draftedBy: access.userId,
              model: result.model,
              // The words as the box will hold them, once the screen has put the link in.
              textHash: hashOf(text),
            },
            select: { id: true },
          });
    return {
      draftId: draft?.id ?? null,
      usedThisMonth: await usedThisMonth(tx, context.now, prepared.timeZone),
    };
  });
  return {
    text,
    quoteUpdatedAt: quote.updatedAt,
    removedAmounts: typed.removed,
    chat:
      prepared.conversationId === null || saved.draftId === null
        ? null
        : { conversationId: prepared.conversationId, draftId: saved.draftId },
    usedThisMonth: saved.usedThisMonth,
    monthlyLimit: MONTHLY_AI_LIMIT,
  };
}
