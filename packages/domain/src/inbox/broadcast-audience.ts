// Who a broadcast reaches (sales inbox spec 6, rebuilt 2026-10-26): the open chats carrying any of the tags, minus those the
// sender may not see, those whose person asked to stop, and those with no WhatsApp consent recorded (a customer who wrote
// first has not agreed to marketing: Meta asks for the opt-in), then as many as the month's marketing allowance has room for.
// The preview and the confirm both read it, so what is shown is what is sent.
import type { BroadcastPreview, BroadcastPreviewInput } from "@travel-crm/contracts/inbox";
import { joinSql, sql, type OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { liveConnection } from "./connection-row.js";
import { visibleConversations } from "./scope.js";
import { monthStartOf } from "./usage.js";

export interface Audience {
  /** The chats that will get it, in the order they are sent. */
  chatIds: string[];
  preview: BroadcastPreview;
  template: { id: string; name: string; category: string; body: string };
  tags: { id: string; name: string }[];
}

/** The start of the calendar day of `now` in the zone, as an instant (the day's template cap counts from it). */
const IST = "Asia/Kolkata";

export async function broadcastAudience(
  tx: OrgTx,
  access: MemberAccess,
  input: BroadcastPreviewInput,
  now: Date,
): Promise<Audience> {
  const template = await tx.whatsappTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, name: true, category: true, body: true, status: true },
  });
  if (template?.status !== "approved") {
    throw new DomainError("CONFLICT", "TEMPLATE_NOT_APPROVED", "Only an approved template can be sent");
  }
  const tagIds = [...new Set(input.tagIds)];
  const tags = await tx.inboxTag.findMany({ where: { id: { in: tagIds } }, select: { id: true, name: true } });
  if (tags.length !== tagIds.length) throw new DomainError("NOT_FOUND", "NOT_FOUND", "A tag no longer exists");

  const tagged = await tx.whatsappConversation.findMany({
    where: { hidden: false, state: "open", tags: { some: { tagId: { in: tagIds } } } },
    orderBy: { id: "asc" },
    select: { id: true, personId: true },
  });
  const seen = new Set(
    (
      await tx.whatsappConversation.findMany({
        where: { AND: [{ id: { in: tagged.map((chat) => chat.id) } }, visibleConversations(access)] },
        select: { id: true },
      })
    ).map((chat) => chat.id),
  );
  const visible = tagged.filter((chat) => seen.has(chat.id));
  const personIds = [...new Set(visible.flatMap((chat) => (chat.personId === null ? [] : [chat.personId])))];
  const latest =
    personIds.length === 0
      ? []
      : await tx.$queryRaw<{ personId: string; action: string }[]>(sql`
          SELECT DISTINCT ON (person_id) person_id AS "personId", action
          FROM person_consent
          WHERE purpose = 'whatsapp' AND person_id IN (${joinSql(personIds.map((id) => sql`${id}::uuid`))})
          ORDER BY person_id, recorded_at DESC, id DESC`);
  const consent = new Map(latest.map((row) => [row.personId, row.action]));
  let optedOut = 0;
  let noConsent = 0;
  const eligible: string[] = [];
  for (const chat of visible) {
    const state = chat.personId === null ? undefined : consent.get(chat.personId);
    if (state === "granted") eligible.push(chat.id);
    else if (state === "withdrawn") optedOut += 1;
    else noConsent += 1;
  }

  const connection = await liveConnection(tx);
  const marketing = template.category === "marketing";
  let allowance: BroadcastPreview["allowance"] = null;
  let chatIds = eligible;
  if (marketing && connection !== null) {
    const used = await marketingUsed(tx, connection.id, now);
    const remaining = Math.max(0, connection.marketingCapMonth - used);
    allowance = { limit: connection.marketingCapMonth, used, remaining };
    chatIds = eligible.slice(0, remaining);
  }
  const sentToday = await tx.whatsappMessage.count({
    where: {
      kind: "template",
      direction: "out",
      occurredAt: { gte: dayStart(now) },
      status: { notIn: ["failed", "superseded"] },
    },
  });
  const roomToday = Math.max(0, (connection?.templateCapDay ?? 0) - sentToday);
  const sendToday = Math.min(chatIds.length, roomToday);
  return {
    chatIds,
    template: { id: template.id, name: template.name, category: template.category, body: template.body },
    tags,
    preview: {
      willSend: chatIds.length,
      leftOut: {
        optedOut,
        noConsent,
        outsideVisibility: tagged.length - visible.length,
        overAllowance: eligible.length - chatIds.length,
      },
      allowance,
      today: { sendToday, waitForTomorrow: chatIds.length - sendToday },
    },
  };
}

/**
 * Marketing messages the month has used or promised: those MSG91 took, those still on their way, and those waiting in a
 * broadcast that is not over (each will go as a marketing message, so it holds a place in the allowance).
 */
async function marketingUsed(tx: OrgTx, connectionId: string, now: Date): Promise<number> {
  const usage = await tx.whatsappUsageMonth.findFirst({
    where: { connectionId, month: monthStartOf(now, IST) },
    select: { marketing: true },
  });
  const onItsWay = await tx.whatsappMessage.count({
    where: { kind: "template", status: { in: ["queued", "sending"] }, template: { is: { category: "marketing" } } },
  });
  const promised = await tx.whatsappBroadcastRecipient.count({
    where: {
      state: "waiting",
      broadcast: { is: { status: { in: ["sending", "paused"] }, template: { is: { category: "marketing" } } } },
    },
  });
  return (usage?.marketing ?? 0) + onItsWay + promised;
}

function dayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const at = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0") % 24;
  return new Date(now.getTime() - ((at("hour") * 60 + at("minute")) * 60 + at("second")) * 1000);
}
