// What makes a lead hot (sales execution), as it happens: the customer opened their quote's link, or wrote one of the
// agency's buying words ("price", "book"). Each is kept as a signal (its event's key makes a repeat nothing), and the
// lead's owner is told to call now: on the quote's second open (the first already tells whoever shared it), and on a
// buying word at most once every six hours. The alert carries fixed words, never the customer's own (a push passes
// through the phone maker's servers).
import { whatsappCustomerWroteEvent } from "@travel-crm/contracts/inbox";
import { shareLinkOpenedEvent } from "@travel-crm/contracts/share-links";
import type { OrgTx } from "@travel-crm/db";
import { noticeKey } from "../crm/index.js";
import { CUSTOMER_WROTE_EVENT } from "../inbox/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import { systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";

export const HOT_LEAD_KIND = "sales.hot-lead";
const SIX_HOURS = 6 * 3_600_000;

/** What a customer writes when they are close to buying (English and Hinglish), matched as whole words. */
export const BUYING_WORDS = ["price", "rate", "book", "booking", "confirm", "advance", "payment", "kitna"] as const;

/** Whether the text holds a buying word or phrase, whole, in any case. */
export function holdsBuyingWord(text: string, keywords: readonly string[]): boolean {
  const words = ` ${text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(" ")} `;
  return keywords.some((keyword) => {
    const wanted = keyword
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .join(" ");
    return wanted !== "" && words.includes(` ${wanted} `);
  });
}

async function tellOwner(
  tx: OrgTx,
  organizationId: string,
  lead: { id: string; ownerUserId: string | null; name: string },
  words: { key: string; title: string; body: string },
): Promise<void> {
  if (lead.ownerUserId === null) return;
  await notify(tx, systemActor(organizationId), {
    recipientUserIds: [lead.ownerUserId],
    sourceEventId: noticeKey(words.key, HOT_LEAD_KIND),
    kind: HOT_LEAD_KIND,
    title: words.title,
    body: words.body,
    link: `/leads/${lead.id}`,
    channels: ["push"],
  });
}

/** The quote's link was opened: the lead is hot, and on a second open its owner is told to call. */
export function quoteOpenedListener(): EventListener {
  return defineListener({
    name: "sales.quote-opened",
    eventType: "share-link.opened",
    payload: shareLinkOpenedEvent,
    handle: async (event, context) => {
      await context.forOrg(async (tx) => {
        const link = await tx.shareLink.findUnique({
          where: { id: event.payload.shareLinkId },
          select: { recordType: true, recordId: true },
        });
        if (link?.recordType !== "quote") return;
        const quote = await tx.quote.findUnique({
          where: { id: link.recordId },
          select: {
            leadId: true,
            title: true,
            status: true,
            lead: { select: { ownerUserId: true, person: { select: { name: true } } } },
          },
        });
        // A replaced quote is no longer on offer: opening its old link says so, and is no sign of interest.
        if (quote === null || quote.status === "replaced") return;
        await tx.leadSignal.createMany({
          data: [
            { leadId: quote.leadId, kind: "quote_opened", sourceKey: `open:${event.payload.openId}`, at: new Date() },
          ],
          skipDuplicates: true,
        });
        const opens = await tx.leadSignal.count({ where: { leadId: quote.leadId, kind: "quote_opened" } });
        if (opens !== 2) return;
        await tellOwner(
          tx,
          event.organizationId,
          { id: quote.leadId, ownerUserId: quote.lead.ownerUserId, name: quote.lead.person.name },
          {
            key: `${quote.leadId}:opened-again`,
            title: `Call ${quote.lead.person.name} now: they opened the quote again`,
            body: `"${quote.title}" was opened twice. They are deciding.`,
          },
        );
      });
    },
  });
}

/** A customer wrote: a buying word makes the lead hot and tells its owner. */
export function customerWroteListener(): EventListener {
  return defineListener({
    name: "sales.customer-wrote",
    eventType: CUSTOMER_WROTE_EVENT,
    payload: whatsappCustomerWroteEvent,
    handle: async (event, context) => {
      await context.forOrg(async (tx) => {
        const chat = await tx.whatsappConversation.findUnique({
          where: { id: event.payload.conversationId },
          select: { personId: true },
        });
        if (chat?.personId == null) return;
        const message = await tx.whatsappMessage.findUnique({
          where: { id: event.payload.messageId },
          select: { body: true, caption: true, occurredAt: true },
        });
        const text = message?.body ?? message?.caption ?? "";
        if (message === null || !holdsBuyingWord(text, BUYING_WORDS)) return;
        const lead = await tx.lead.findFirst({
          where: { personId: chat.personId, stage: { in: ["new", "contacted", "quote_sent", "booking_requested"] } },
          orderBy: { createdAt: "desc" },
          select: { id: true, ownerUserId: true, person: { select: { name: true } } },
        });
        if (lead === null) return;
        await tx.leadSignal.createMany({
          data: [
            {
              leadId: lead.id,
              kind: "asked_price",
              sourceKey: `message:${event.payload.messageId}`,
              at: message.occurredAt,
            },
          ],
          skipDuplicates: true,
        });
        await tellOwner(
          tx,
          event.organizationId,
          { id: lead.id, ownerUserId: lead.ownerUserId, name: lead.person.name },
          {
            key: `${lead.id}:asked:${String(Math.floor(message.occurredAt.getTime() / SIX_HOURS))}`,
            title: `${lead.person.name} is asking to book. Reply now`,
            body: "Open the chat and reply now.",
          },
        );
      });
    },
  });
}
