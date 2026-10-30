// The Follow-ups screen's rows (the owner, 2026-10-30): every open follow-up on a lead, due now (overdue and today on the
// agency's clock) or later, the member's own or everyone's (with leads:view over all), each with its lead, the lead's
// WhatsApp chat (its last message: when, from whom, what; and whether the 24-hour window is open) and what the AI did the
// last time the follow-up came due. A handful of queries for the whole page, never one per row.
import { leadStage } from "@travel-crm/contracts/crm";
import type { FollowUpRow, FollowUpsInput } from "@travel-crm/contracts/ai";
import { followUpTouchOutcomes } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone, scopeFilter, type MemberAccess } from "../identity/index.js";
import { windowIsOpen } from "../inbox/index.js";
import { addDays, calendarDateIn, startOfDayIn } from "../kernel/index.js";
import { AI_TOKEN_PREFIX } from "./agent.js";

const PAGE = 200;
const TEXT_MAX = 200;

type LastFrom = NonNullable<FollowUpRow["whatsapp"]>["lastFrom"];

/** Who wrote a message: the customer, the AI (its token), someone on the team, or the agency's automation. */
function fromOf(message: { direction: string; origin: string; clientToken: string | null }): LastFrom {
  if (message.direction === "in") return "customer";
  if (message.clientToken?.startsWith(AI_TOKEN_PREFIX) === true) return "ai";
  return message.origin === "staff_crm" || message.origin === "staff_phone" ? "team" : "automation";
}

const textOf = (message: { body: string | null; caption: string | null } | undefined) =>
  (message?.body ?? message?.caption ?? null)?.slice(0, TEXT_MAX) ?? null;

export async function followUpBoardOf(
  tx: OrgTx,
  access: MemberAccess,
  input: FollowUpsInput,
  now: Date,
): Promise<{ rows: FollowUpRow[]; mentioned: string[] }> {
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  const endsAt = startOfDayIn(addDays(calendarDateIn(now, timeZone), 1), timeZone);
  const tasks = await tx.task.findMany({
    where: {
      kind: "follow-up",
      recordType: "lead",
      doneAt: null,
      cancelledAt: null,
      ...(input.mine ? { assigneeUserId: access.userId } : scopeFilter(access, "leads:view", "assigneeUserId")),
      ...(input.view === "due"
        ? { dueAt: { lt: endsAt } }
        : input.view === "upcoming"
          ? { dueAt: { gte: endsAt } }
          : {}),
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: PAGE,
    select: { id: true, title: true, dueAt: true, assigneeUserId: true, recordId: true, byAi: true },
  });
  const leadIds = [...new Set(tasks.flatMap((task) => (task.recordId === null ? [] : [task.recordId])))];
  const leads = await tx.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, stage: true, person: { select: { id: true, name: true, phoneE164: true } } },
  });
  const chats = await tx.whatsappConversation.findMany({
    where: { personId: { in: leads.map((lead) => lead.person.id) } },
    orderBy: [{ lastInboundAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    select: { id: true, personId: true, lastInboundAt: true },
  });
  // A person's chat is the one they wrote in last (chats come newest first).
  const chatOfPerson = new Map<string, (typeof chats)[number]>();
  for (const chat of chats)
    if (chat.personId !== null && !chatOfPerson.has(chat.personId)) chatOfPerson.set(chat.personId, chat);
  const shown = [...chatOfPerson.values()].map((chat) => chat.id);
  const lastMessages = await tx.whatsappMessage.findMany({
    where: { conversationId: { in: shown } },
    distinct: ["conversationId"],
    orderBy: [{ conversationId: "asc" }, { occurredAt: "desc" }],
    select: {
      conversationId: true,
      direction: true,
      origin: true,
      clientToken: true,
      body: true,
      caption: true,
      occurredAt: true,
    },
  });
  const lastOf = new Map(lastMessages.map((message) => [message.conversationId, message]));
  const touches = await tx.aiFollowUpTouch.findMany({
    where: { taskId: { in: tasks.map((task) => task.id) } },
    orderBy: { createdAt: "desc" },
    select: { taskId: true, createdAt: true, outcome: true, messageId: true },
  });
  const touchOf = new Map<string, (typeof touches)[number]>();
  for (const touch of touches) if (!touchOf.has(touch.taskId)) touchOf.set(touch.taskId, touch);
  const sentIds = [...touchOf.values()].flatMap((touch) => (touch.messageId === null ? [] : [touch.messageId]));
  const sent = await tx.whatsappMessage.findMany({
    where: { id: { in: sentIds } },
    select: { id: true, body: true, caption: true },
  });
  const sentOf = new Map(sent.map((message) => [message.id, message]));
  const leadOf = new Map(leads.map((lead) => [lead.id, lead]));

  const rows = tasks.flatMap((task): FollowUpRow[] => {
    const lead = task.recordId === null ? undefined : leadOf.get(task.recordId);
    if (lead === undefined) return [];
    const chat = chatOfPerson.get(lead.person.id);
    const last = chat === undefined ? undefined : lastOf.get(chat.id);
    const touch = touchOf.get(task.id);
    const outcome = followUpTouchOutcomes.find((one) => one === touch?.outcome);
    return [
      {
        taskId: task.id,
        title: task.title,
        dueAt: task.dueAt.toISOString(),
        assigneeUserId: task.assigneeUserId,
        byAi: task.byAi,
        lead: {
          id: lead.id,
          name: lead.person.name,
          stage: leadStage.parse(lead.stage),
          phone: lead.person.phoneE164,
        },
        whatsapp:
          chat === undefined
            ? null
            : {
                conversationId: chat.id,
                lastAt: last?.occurredAt.toISOString() ?? null,
                lastFrom: last === undefined ? null : fromOf(last),
                lastText: textOf(last),
                windowOpen: windowIsOpen(chat.lastInboundAt, now),
              },
        ai:
          touch === undefined || outcome === undefined
            ? null
            : {
                at: touch.createdAt.toISOString(),
                outcome,
                text: touch.messageId === null ? null : textOf(sentOf.get(touch.messageId)),
              },
      },
    ];
  });
  const mentioned = [...new Set(rows.flatMap((row) => (row.assigneeUserId === null ? [] : [row.assigneeUserId])))];
  return { rows, mentioned };
}
