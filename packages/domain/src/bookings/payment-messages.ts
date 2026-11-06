// Telling the customer what a person decided about their payment (confirmed, or not found): the agency's own words with
// {name}, {amount}, {trip} and {date} filled in. Inside WhatsApp's 24-hour window they go as free text; outside it, as the
// agency's approved template for that message; with neither, one task for the lead's owner to tell them by hand. A blank
// the record can't fill (no name, no amount known, no quote a person made) keeps the words from going as free text. Every
// id and client token comes from the record's key, so a repeat sends and makes nothing more. One builder makes the words
// for the person's preview and for the send. Only code after a person's decision calls this: the AI never sends it.
import { blanksIn, fillBlanks } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone } from "../identity/index.js";
import { windowIsOpen } from "../inbox/index.js";
import { uuidFromKey } from "../jobs/index.js";
import { calendarDateIn, formatMoney, money, systemActor } from "../kernel/index.js";
import { chatForLead, fillParams, formatDayWords, sendToChat, type AutoSendResult } from "../sales/index.js";
import { createTask } from "../tasks/index.js";
import { tripUpdatesAgreed } from "./reminders.js";
import { bookingSettingsOf } from "./settings.js";

export type PaymentOutcome = "confirmed" | "not_found";

const TASK_TITLE: Record<PaymentOutcome, string> = {
  confirmed: "Tell {name} their payment was confirmed",
  not_found: "Tell {name} their payment wasn't found",
};

export interface PaymentTelling {
  organizationId: string;
  leadId: string | null;
  conversationId: string | null;
  outcome: PaymentOutcome;
  /** The amount the words name; null when nobody knows it, so {amount} stays unfilled (never "₹0.00"). */
  amountPaise: number | null;
  /** The title of the quote a person made for the trip; null when there is none, so {trip} stays unfilled. */
  trip: string | null;
  /** What the decision is about (the proof or claim), so a repeat of it is the same telling. */
  recordKey: string;
  /** The agency's name, for a template parameter that asks for it. */
  agencyName?: string;
}

/** How the customer will hear it: these words as a message, the agency's template, or a task for a person. */
export type PaymentTellingPreview = { way: "message"; text: string } | { way: "template" } | { way: "task" };

const chatColumns = {
  id: true,
  personId: true,
  phoneE164: true,
  lastInboundAt: true,
  connectionId: true,
  hidden: true,
  state: true,
} as const;

/**
 * The chat to write to: the lead's (found, or made when `make`), else the conversation the booking came from. "later"
 * when the lead's chat is not made yet, so only a template could start it.
 */
async function chatToTellIn(tx: OrgTx, input: Pick<PaymentTelling, "leadId" | "conversationId">, make: boolean) {
  if (input.leadId !== null) {
    const found = await chatForLead(tx, input.leadId, make);
    if (found.chat !== null) return found.chat;
    if (found.reason === "none_yet") return "later" as const;
  }
  if (input.conversationId === null) return null;
  const chat = await tx.whatsappConversation.findUnique({ where: { id: input.conversationId }, select: chatColumns });
  if (chat?.personId == null || chat.hidden || chat.state !== "open") return null;
  return { ...chat, personId: chat.personId };
}

/** A real name to greet: a stand-in ("WhatsApp +91...") or nothing is none. */
const realName = (name: string | undefined) => {
  const trimmed = name?.trim() ?? "";
  return trimmed === "" || trimmed.startsWith("WhatsApp") ? null : trimmed;
};

/** The words, template and people of a telling: the one builder behind the preview and the send. */
async function composeTelling(tx: OrgTx, input: PaymentTelling, chatPersonId: string | null, now: Date) {
  const settings = await bookingSettingsOf(tx);
  const confirmed = input.outcome === "confirmed";
  const text = confirmed ? settings.paymentConfirmedText : settings.paymentNotFoundText;
  const lead =
    input.leadId === null
      ? null
      : await tx.lead.findUnique({ where: { id: input.leadId }, select: { ownerUserId: true, personId: true } });
  const personId = lead?.personId ?? chatPersonId;
  const person =
    personId === null ? null : await tx.person.findUnique({ where: { id: personId }, select: { name: true } });
  const fullName = realName(person?.name);
  const first = fullName?.split(/\s+/)[0] ?? null;
  // The day the person decided, in the agency's own zone.
  const day = calendarDateIn(now, await organizationTimeZone(tx, input.organizationId));
  const dated = formatDayWords(new Date(`${day}T00:00:00Z`), now);
  const filled = fillBlanks(text, {
    ...(first === null ? {} : { name: first }),
    ...(input.amountPaise === null ? {} : { amount: formatMoney(money(input.amountPaise)) }),
    ...(input.trip === null ? {} : { trip: input.trip }),
    date: dated,
  });
  const agencyName = input.agencyName ?? "our team";
  const facts = {
    ownerUserId: lead?.ownerUserId ?? null,
    firstName: first ?? "",
    destination: input.trip,
    when: dated,
  };
  return {
    personId,
    ownerUserId: lead?.ownerUserId ?? null,
    // A blank left unfilled never reaches the customer as free text: the template or a task takes over.
    freeText: blanksIn(filled).length === 0 ? filled : null,
    templateId: confirmed ? settings.paymentConfirmedTemplateId : settings.paymentNotFoundTemplateId,
    params: fillParams(confirmed ? settings.paymentConfirmedParams : settings.paymentNotFoundParams, facts, {
      agencyName,
      agentName: null,
      payment: { amountPaise: input.amountPaise, dueOn: day, link: agencyName },
    }),
    taskTitle: TASK_TITLE[input.outcome].replace("{name}", fullName ?? "the customer").slice(0, 200),
  };
}

/** How the customer would be told now, changing nothing: what the confirm and refuse dialogs show. */
export async function previewPaymentTelling(
  tx: OrgTx,
  input: PaymentTelling,
  now: Date,
): Promise<PaymentTellingPreview> {
  const chat = await chatToTellIn(tx, input, false);
  const open = chat === null || chat === "later" ? null : chat;
  const telling = await composeTelling(tx, input, open?.personId ?? null, now);
  if (open !== null && telling.freeText !== null && windowIsOpen(open.lastInboundAt, now))
    return { way: "message", text: telling.freeText };
  // A chat not made yet is made by the send, which then tries the template.
  if (chat !== null && telling.templateId !== null) return { way: "template" };
  return { way: "task" };
}

export async function tellPaymentOutcome(
  tx: OrgTx,
  input: PaymentTelling,
  now: Date,
): Promise<"sent" | "template" | "task"> {
  const token = `payment-message:${input.outcome}:${input.recordKey}`;
  const taskId = uuidFromKey(`payment-task:${token}`);
  const earlier = await tx.whatsappMessage.findFirst({ where: { clientToken: token }, select: { kind: true } });
  if (earlier !== null) return earlier.kind === "template" ? "template" : "sent";
  if ((await tx.task.findUnique({ where: { id: taskId }, select: { id: true } })) !== null) return "task";

  const found = await chatToTellIn(tx, input, true);
  const chat = found === "later" ? null : found;
  const telling = await composeTelling(tx, input, chat?.personId ?? null, now);
  let result: AutoSendResult = { kind: "never", reason: "no_chat" };
  if (chat !== null) {
    result = await sendToChat(
      tx,
      chat,
      {
        organizationId: input.organizationId,
        templateId: telling.templateId,
        params: telling.params,
        ...(telling.freeText === null ? {} : { sessionText: telling.freeText }),
        agreed: telling.personId === null ? false : await tripUpdatesAgreed(tx, telling.personId),
        clientToken: token,
      },
      now,
    );
  }
  if (result.kind === "sent") {
    const message = await tx.whatsappMessage.findUnique({ where: { id: result.messageId }, select: { kind: true } });
    return message?.kind === "template" ? "template" : "sent";
  }
  await createTask(tx, systemActor(input.organizationId), {
    id: taskId,
    kind: "task",
    title: telling.taskTitle,
    dueAt: now,
    assigneeUserId: telling.ownerUserId,
    record: input.leadId === null ? null : { recordType: "lead", recordId: input.leadId },
  });
  return "task";
}
