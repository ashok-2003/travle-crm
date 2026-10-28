// The agency's settings for automatic answers (sales inbox spec 6): a welcome to a number writing for the first time, a
// keyword's answer ("price" → the price list), and an away message outside working hours. They are written by the Owner
// and Admins (inbox:templates); every change is audited. The worker answers with them in automation-answer.ts.
import {
  inboxAutomation,
  keywordReplyList,
  keywordReply,
  type CreateKeywordReplyInput,
  type InboxAutomation,
  type KeywordReply,
  type SaveInboxAutomationInput,
} from "@travel-crm/contracts/inbox";
import { isUniqueViolation, softDeleted, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

/** Published when a customer writes and the agency has an automatic answer that could fit (never a reaction, a blocked contact, or STOP). */
export const CUSTOMER_WROTE_EVENT = "whatsapp.customer-wrote";
/** Published for every customer message with words, whatever automation the agency has (see whatsappTextReceivedEvent). */
export const TEXT_RECEIVED_EVENT = "whatsapp.text-received";

const defaults: InboxAutomation = {
  awayEnabled: false,
  awayMessage: "",
  openFrom: 600,
  openUntil: 1140,
  openDays: [1, 2, 3, 4, 5, 6],
  welcomeEnabled: false,
  welcomeMessage: "",
};
const automationFields = {
  awayEnabled: true,
  awayMessage: true,
  openFrom: true,
  openUntil: true,
  openDays: true,
  welcomeEnabled: true,
  welcomeMessage: true,
} as const;

export async function automationOf(tx: OrgTx): Promise<InboxAutomation> {
  const row = await tx.inboxAutomation.findFirst({ select: automationFields });
  return inboxAutomation.parse(row ?? defaults);
}

export async function saveAutomation(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveInboxAutomationInput,
): Promise<InboxAutomation> {
  const before = await automationOf(tx);
  const data = { ...input, openDays: [...new Set(input.openDays)].sort(), updatedBy: access.userId };
  const existing = await tx.inboxAutomation.findFirst({ select: { id: true } });
  const row =
    existing === null
      ? await tx.inboxAutomation.create({ data, select: { ...automationFields, id: true } })
      : await tx.inboxAutomation.update({
          where: { id: existing.id },
          data,
          select: { ...automationFields, id: true },
        });
  await recordAudit(tx, access, {
    action: "inbox.automation-changed",
    entityType: "inbox_automation",
    entityId: row.id,
    before: auditView(before),
    after: auditView(row),
  });
  return inboxAutomation.parse(row);
}

/** What an audit entry shows of the settings: the switches, the hours and the two messages (the agency's own words). */
const auditView = (settings: InboxAutomation) => ({
  away: settings.awayEnabled,
  welcome: settings.welcomeEnabled,
  hours: `${minuteText(settings.openFrom)}-${minuteText(settings.openUntil)}, days ${[...settings.openDays].sort().join(" ") || "none"}`,
  awayText: settings.awayMessage,
  welcomeText: settings.welcomeMessage,
});
const minuteText = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Whether anything could act on a customer's message: the welcome or away message is on, a keyword answer is, or a trip's keywords. */
export async function automationCouldAct(tx: OrgTx): Promise<boolean> {
  const settings = await automationOf(tx);
  if (
    (settings.welcomeEnabled && settings.welcomeMessage !== "") ||
    (settings.awayEnabled && settings.awayMessage !== "")
  ) {
    return true;
  }
  if ((await tx.inboxKeywordReply.count({ where: { enabled: true } })) > 0) return true;
  // Sales execution listens too: a customer who writes ends their follow-ups, and a buying word makes the lead hot. With
  // no settings saved, the buying words are on by default.
  const sales = await tx.salesAutomation.findFirst({ select: { hotKeywords: true, followEnabled: true } });
  if (sales?.followEnabled === true) return true;
  return (await tx.tripKit.count({ where: { autoSend: true, keywords: { isEmpty: false } } })) > 0;
}

const keywordFields = { id: true, keyword: true, reply: true, enabled: true } as const;

export async function listKeywordReplies(tx: OrgTx): Promise<KeywordReply[]> {
  return keywordReplyList.parse(
    await tx.inboxKeywordReply.findMany({ orderBy: { keyword: "asc" }, select: keywordFields }),
  );
}

export async function createKeywordReply(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateKeywordReplyInput,
): Promise<KeywordReply> {
  const taken = () => new DomainError("CONFLICT", "KEYWORD_TAKEN", "This word already has an answer");
  if ((await tx.inboxKeywordReply.findFirst({ where: { keyword: input.keyword }, select: { id: true } })) !== null) {
    throw taken();
  }
  try {
    const row = await tx.inboxKeywordReply.create({
      data: { ...input, createdBy: access.userId },
      select: keywordFields,
    });
    await recordAudit(tx, access, {
      action: "inbox.keyword-reply-created",
      entityType: "inbox_keyword_reply",
      entityId: row.id,
      after: { keyword: row.keyword },
    });
    return keywordReply.parse(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw taken();
    throw error;
  }
}

export async function deleteKeywordReply(tx: OrgTx, access: MemberAccess, keywordReplyId: string): Promise<void> {
  const row = await tx.inboxKeywordReply.findUnique({ where: { id: keywordReplyId }, select: keywordFields });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  await tx.inboxKeywordReply.update({ where: { id: row.id }, data: softDeleted(access.userId) });
  await recordAudit(tx, access, {
    action: "inbox.keyword-reply-deleted",
    entityType: "inbox_keyword_reply",
    entityId: row.id,
    before: { keyword: row.keyword },
  });
}
