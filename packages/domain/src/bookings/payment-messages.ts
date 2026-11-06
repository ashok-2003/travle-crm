// Telling the customer what a person decided about their payment (confirmed, or not found): the agency's own words with
// {name}, {amount}, {trip} and {date} filled in. Inside WhatsApp's 24-hour window they go as free text; outside it, as the
// agency's approved template for that message; with neither, one task for the lead's owner to tell them by hand. Every id
// and client token comes from the record's key, so a repeat sends and makes nothing more. Only code after a person's
// decision calls this: the AI never sends it.
import { fillBlanks } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { uuidFromKey } from "../jobs/index.js";
import { formatMoney, money, systemActor, type CalendarDate } from "../kernel/index.js";
import { chatForLead, fillParams, sendToChat, type AutoSendResult } from "../sales/index.js";
import { createTask } from "../tasks/index.js";
import { tripUpdatesAgreed } from "./reminders.js";
import { bookingSettingsOf } from "./settings.js";

export type PaymentOutcome = "confirmed" | "not_found";

const TASK_TITLE: Record<PaymentOutcome, string> = {
  confirmed: "Tell {name} their payment was confirmed",
  not_found: "Tell {name} their payment wasn't found",
};

const dayWords = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const dayWordsWithYear = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** A calendar day as "16 Oct", or "16 Oct 2027" in another year than now's; no day means today. */
function dayText(day: CalendarDate | null, now: Date): string {
  const date = day === null ? now : new Date(`${day}T00:00:00Z`);
  return (date.getUTCFullYear() === now.getUTCFullYear() ? dayWords : dayWordsWithYear).format(date);
}

/** The chat to write to: the lead's (found or made), else the conversation the booking came from. */
async function chatToTellIn(tx: OrgTx, input: { leadId: string | null; conversationId: string | null }) {
  if (input.leadId !== null) {
    const found = await chatForLead(tx, input.leadId);
    if (found.chat !== null) return found.chat;
  }
  if (input.conversationId === null) return null;
  const chat = await tx.whatsappConversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      personId: true,
      phoneE164: true,
      lastInboundAt: true,
      connectionId: true,
      hidden: true,
      state: true,
    },
  });
  if (chat?.personId == null || chat.hidden || chat.state !== "open") return null;
  return { ...chat, personId: chat.personId };
}

export async function tellPaymentOutcome(
  tx: OrgTx,
  input: {
    organizationId: string;
    leadId: string | null;
    conversationId: string | null;
    outcome: PaymentOutcome;
    amountPaise: number;
    trip: string;
    date: CalendarDate | null;
    /** What the decision is about (the proof or claim), so a repeat of it is the same telling. */
    recordKey: string;
    /** The agency's name, for a template parameter that asks for it. */
    agencyName?: string;
  },
  now: Date,
): Promise<"sent" | "template" | "task"> {
  const token = `payment-message:${input.outcome}:${input.recordKey}`;
  const taskId = uuidFromKey(`payment-task:${token}`);
  const earlier = await tx.whatsappMessage.findFirst({ where: { clientToken: token }, select: { kind: true } });
  if (earlier !== null) return earlier.kind === "template" ? "template" : "sent";
  if ((await tx.task.findUnique({ where: { id: taskId }, select: { id: true } })) !== null) return "task";

  const settings = await bookingSettingsOf(tx);
  const confirmed = input.outcome === "confirmed";
  const text = confirmed ? settings.paymentConfirmedText : settings.paymentNotFoundText;
  const templateId = confirmed ? settings.paymentConfirmedTemplateId : settings.paymentNotFoundTemplateId;
  const params = confirmed ? settings.paymentConfirmedParams : settings.paymentNotFoundParams;

  const chat = await chatToTellIn(tx, input);
  const lead =
    input.leadId === null
      ? null
      : await tx.lead.findUnique({ where: { id: input.leadId }, select: { ownerUserId: true, personId: true } });
  const personId = lead?.personId ?? chat?.personId ?? null;
  const person =
    personId === null ? null : await tx.person.findUnique({ where: { id: personId }, select: { name: true } });
  const fullName = person?.name.trim() ?? "";
  const first = fullName.split(/\s+/)[0] ?? "";
  const dated = dayText(input.date, now);
  const agencyName = input.agencyName ?? "our team";

  let result: AutoSendResult = { kind: "never", reason: "no_chat" };
  if (chat !== null) {
    const facts = { ownerUserId: lead?.ownerUserId ?? null, firstName: first, destination: input.trip, when: dated };
    result = await sendToChat(
      tx,
      chat,
      {
        organizationId: input.organizationId,
        templateId,
        params: fillParams(params, facts, {
          agencyName,
          agentName: null,
          payment: {
            amountPaise: input.amountPaise,
            dueOn: input.date ?? now.toISOString().slice(0, 10),
            link: agencyName,
          },
        }),
        sessionText: fillBlanks(text, {
          name: first === "" || first.startsWith("WhatsApp") ? "there" : first,
          amount: formatMoney(money(input.amountPaise)),
          trip: input.trip,
          date: dated,
        }),
        agreed: personId === null ? false : await tripUpdatesAgreed(tx, personId),
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
    title: TASK_TITLE[input.outcome].replace("{name}", fullName === "" ? "the customer" : fullName).slice(0, 200),
    dueAt: now,
    assigneeUserId: lead?.ownerUserId ?? null,
    record: input.leadId === null ? null : { recordType: "lead", recordId: input.leadId },
  });
  return "task";
}
