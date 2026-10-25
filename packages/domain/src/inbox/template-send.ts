// Sending a template (spec 3.3, 4.4 S7, 5): the only way to write to a customer outside the 24-hour window, or to start a chat with
// a person who never wrote. Checks, in the transaction: the template is approved, its values fit, nobody asked to stop, the staff
// ticked "they agreed" for a person we start a chat with, the day's template cap and the month's marketing cap, and that
// WhatsApp's own daily limit did not just refuse. The message is queued like any reply; the sender sends it.
import { assertRecordInScope, type MemberAccess } from "../identity/index.js";
import { markersOf, type SendTemplateInput, type SentMessage } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError } from "../kernel/index.js";
import { liveConnection } from "./connection-row.js";
import { MESSAGE_QUEUED_EVENT, sendableChat, showAsLast, sentOf, earlierSend, type ReplyContext } from "./outbox.js";
import { monthStartOf } from "./usage.js";
import { grantWhatsappConsent, whatsappConsentOf } from "./whatsapp-consent.js";

const HOUR = 3_600_000;

/** The template's words with its values in place of {{1}}, {{2}}... */
export const renderTemplate = (body: string, parameters: readonly string[]): string =>
  body.replace(/\{\{(\d+)\}\}/g, (marker: string, index: string) => parameters[Number(index) - 1] ?? marker);

/** The start of the calendar day of `now` in the zone, as an instant. */
function dayStart(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const at = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0") % 24;
  return new Date(now.getTime() - ((at("hour") * 60 + at("minute")) * 60 + at("second")) * 1000);
}

/** The chat a template is checked against: what `sendableChat` gives. */
interface TemplateChat {
  id: string;
  personId: string | null;
  lastInboundAt: Date | null;
  connectionId: string;
}

/**
 * Every check a template send must pass, for a first send and for Try again alike (spec 4.4 S7): the template is approved and
 * its values fit; the person has not asked to stop (and, for a chat we start, staff ticked that they agreed); the day's and
 * the month's caps; WhatsApp's own limit. The connection's row is locked first, so two sends at once cannot both take the last
 * place under a cap.
 */
export async function assertTemplateAllowed(
  tx: OrgTx,
  access: MemberAccess,
  input: { chat: TemplateChat; templateId: string; parameters: readonly string[]; agreed: boolean; now: Date },
) {
  const { chat, now } = input;
  await tx.$queryRaw`SELECT id FROM whatsapp_connection WHERE id = ${chat.connectionId}::uuid FOR UPDATE`;
  const template = await tx.whatsappTemplate.findFirst({
    where: { id: input.templateId, connectionId: chat.connectionId },
  });
  if (template?.status !== "approved") {
    throw new DomainError("CONFLICT", "TEMPLATE_NOT_APPROVED", "Only an approved template can be sent");
  }
  if (input.parameters.length !== markersOf(template.body).length) {
    throw new DomainError("VALIDATION", "TEMPLATE_VALUES", "Give a value for each blank in the template");
  }
  const startedByUs = chat.lastInboundAt === null;
  if (startedByUs) {
    // Starting a chat is changing the lead (3.3): the member must be allowed to edit leads, and see this person's.
    if (!access.permissions.has("leads:edit")) {
      throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires leads:edit");
    }
  }
  let consentRecorded = false;
  if (chat.personId !== null) {
    const consent = await whatsappConsentOf(tx, chat.personId);
    const optedOut = consent.state === "withdrawn" && consent.source === "customer";
    const wroteSince =
      consent.at !== null && chat.lastInboundAt !== null && chat.lastInboundAt.getTime() > consent.at.getTime();
    if (optedOut && !(wroteSince && input.agreed)) {
      throw new DomainError("CONFLICT", "NO_CONSENT_FOR_TEMPLATE", "This person asked to stop WhatsApp messages");
    }
    if (optedOut || (startedByUs && consent.state !== "granted")) {
      if (!input.agreed)
        throw new DomainError("CONFLICT", "CONSENT_TICK_NEEDED", "Tick that they agreed to WhatsApp messages");
      consentRecorded = true;
      await grantWhatsappConsent(tx, access, { personId: chat.personId, restored: optedOut, now });
    }
  }

  const connection = await liveConnection(tx);
  const month = monthStartOf(now, "Asia/Kolkata");
  const usage = await tx.whatsappUsageMonth.findFirst({ where: { connectionId: chat.connectionId, month } });
  // The month's count grows when MSG91 accepts a send (sender.ts), so what is still on its way is added to it here.
  const onItsWay =
    template.category === "marketing"
      ? await tx.whatsappMessage.count({
          where: {
            kind: "template",
            status: { in: ["queued", "sending"] },
            template: { is: { category: "marketing" } },
          },
        })
      : 0;
  if (template.category === "marketing" && (usage?.marketing ?? 0) + onItsWay >= (connection?.marketingCapMonth ?? 0)) {
    throw new DomainError("LIMIT_REACHED", "MARKETING_CAP_REACHED", "This month's marketing messages are used up");
  }
  const sentToday = await tx.whatsappMessage.count({
    where: {
      kind: "template",
      direction: "out",
      occurredAt: { gte: dayStart(now, "Asia/Kolkata") },
      status: { notIn: ["failed", "superseded"] },
    },
  });
  if (sentToday >= (connection?.templateCapDay ?? 0)) {
    throw new DomainError("LIMIT_REACHED", "TEMPLATE_CAP_REACHED", "Today's template messages are used up");
  }
  const refused = await tx.whatsappMessage.count({
    where: { kind: "template", failureCode: "tier_limit", occurredAt: { gt: new Date(now.getTime() - HOUR) } },
  });
  if (refused > 0) {
    throw new DomainError("LIMIT_REACHED", "TIER_LIMIT_REACHED", "WhatsApp's daily limit for new chats was reached");
  }
  return { template, startedByUs, consentRecorded };
}

export async function queueTemplate(
  tx: OrgTx,
  access: MemberAccess,
  input: SendTemplateInput,
  context: ReplyContext,
  now: Date,
): Promise<SentMessage> {
  const chat = await sendableChat(tx, access, input.conversationId, context, now, { window: false });
  const earlier = await earlierSend(tx, chat.id, input.clientToken);
  if (earlier !== null) return sentOf(earlier);
  const { template, startedByUs, consentRecorded } = await assertTemplateAllowed(tx, access, {
    chat,
    templateId: input.templateId,
    parameters: input.parameters,
    agreed: input.agreed,
    now,
  });

  const [row] = await tx.whatsappMessage.createManyAndReturn({
    data: [
      {
        conversationId: chat.id,
        direction: "out",
        origin: "staff_crm",
        kind: "template",
        body: renderTemplate(template.body, input.parameters),
        templateId: template.id,
        templateParams: [...input.parameters],
        status: "queued",
        sentBy: access.userId,
        clientToken: input.clientToken,
        occurredAt: now,
      },
    ],
    skipDuplicates: true,
    select: { id: true, status: true },
  });
  if (row === undefined) {
    const twin = await earlierSend(tx, chat.id, input.clientToken);
    if (twin === null) throw new DomainError("CONFLICT", "ATTACHMENT_ID_IN_USE", "This send was made already");
    return sentOf(twin);
  }
  await tx.whatsappTemplate.update({ where: { id: template.id }, data: { lastUsedAt: now } });
  if (startedByUs && consentRecorded && chat.personId !== null) {
    await recordAudit(tx, access, {
      action: "whatsapp.chat-started",
      entityType: "person",
      entityId: chat.personId,
      after: { template: template.name, agreed: true },
    });
  }
  await showAsLast(tx, chat.id, row.id, now);
  await publishEvent(tx, { type: MESSAGE_QUEUED_EVENT, payload: { conversationId: chat.id, messageId: row.id } });
  return sentOf(row);
}

/**
 * A chat with a lead's person who never wrote: the chat is made (for the agency's number) so a template can go in it. The
 * member must be able to see and edit the lead. A chat that exists already is returned as it is.
 */
export async function startChatForLead(
  tx: OrgTx,
  access: MemberAccess,
  leadId: string,
): Promise<{ conversationId: string }> {
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: { ownerUserId: true, personId: true, person: { select: { phoneE164: true } } },
  });
  if (lead === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  assertRecordInScope(access, "leads:view", lead.ownerUserId);
  const connection = await liveConnection(tx);
  if (connection === null || connection.status === "setup" || connection.mode === "demo") {
    throw new DomainError("CONFLICT", "WHATSAPP_NOT_CONNECTED", "WhatsApp is not set up for this agency");
  }
  const phoneE164 = lead.person.phoneE164;
  if (phoneE164 === null) throw new DomainError("CONFLICT", "NO_PERSON_YET", "This person has no phone number");
  await tx.whatsappConversation.createMany({
    data: [{ connectionId: connection.id, phoneE164, personId: lead.personId }],
    skipDuplicates: true,
  });
  const chat = await tx.whatsappConversation.findFirstOrThrow({
    where: { connectionId: connection.id, phoneE164 },
    select: { id: true, personId: true },
  });
  if (chat.personId === null) {
    await tx.whatsappConversation.update({ where: { id: chat.id }, data: { personId: lead.personId } });
  }
  return { conversationId: chat.id };
}
