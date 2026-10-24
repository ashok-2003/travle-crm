// An inbound message (spec 4.3 I1-I7): stored first, in one transaction, under the conversation's lock; then the person and
// lead are found or made by crm's one path; a media message queues its copy. The unique wamid is the ledger: a repeat stops
// at the insert. The message is kept even when the lead step is not allowed (a read-only agency) or fails to apply.
import { toE164 } from "@travel-crm/contracts/kernel";
import type { OrgTx } from "@travel-crm/db";
import type { ParsedMessage } from "@travel-crm/integrations/whatsapp";
import { agencyFactsOf, mayBringIn, receiveWhatsAppContact, type WhatsAppContactOutcome } from "../crm/index.js";
import { publishEvent } from "../jobs/index.js";
import { systemActor } from "../kernel/index.js";
import type { ConnectionRow } from "./connection-row.js";
import { COPY_MEDIA_QUEUE, type InboxDependencies } from "./dependencies.js";
import { firstTextOf, messageColumns } from "./messages.js";
import { bumpUsage, monthStartOf } from "./usage.js";
import { isOptOutText, recordWhatsappOptOut } from "./whatsapp-consent.js";

export interface LockedConversation {
  id: string;
  personId: string | null;
  profileName: string | null;
  lastInboundAt: Date | null;
  lastMessageAt: Date | null;
  needsReply: boolean;
  hidden: boolean;
}

/** Finds or makes the chat for the number and holds it until the transaction ends, so a burst makes one lead (I1). */
export async function lockConversation(
  tx: OrgTx,
  connectionId: string,
  phoneE164: string,
): Promise<LockedConversation> {
  await tx.whatsappConversation.createMany({ data: [{ connectionId, phoneE164 }], skipDuplicates: true });
  const [row] = await tx.$queryRaw<LockedConversation[]>`
    SELECT id, person_id AS "personId", profile_name AS "profileName", last_inbound_at AS "lastInboundAt",
           last_message_at AS "lastMessageAt", needs_reply AS "needsReply", hidden
    FROM whatsapp_conversation
    WHERE connection_id = ${connectionId}::uuid AND phone_e164 = ${phoneE164}
    FOR UPDATE`;
  if (row === undefined) throw new Error("The conversation vanished while it was being locked");
  return row;
}

export type InboundResult = "stored" | "repeat" | "bad_number";

const later = (current: Date | null, candidate: Date): Date =>
  current === null || candidate.getTime() > current.getTime() ? candidate : current;

/** Stores one customer message and does what it calls for. */
export async function receiveInbound(
  dependencies: InboxDependencies,
  organizationId: string,
  connection: ConnectionRow,
  message: ParsedMessage,
  now: Date,
): Promise<InboundResult> {
  const phoneE164 = toE164(message.customerNumber);
  if (phoneE164 === null) return "bad_number";
  // The agency's facts are read before the transaction: they are only needed when the lead step is allowed (spec 8.5).
  const allowed = connection.status !== "paused" && (await mayBringIn(dependencies, organizationId));
  const facts = allowed ? await agencyFactsOf(dependencies, organizationId) : null;
  const { repeat, copy } = await dependencies.db.forOrg(organizationId, async (tx) => {
    const conversation = await lockConversation(tx, connection.id, phoneE164);
    const columns = messageColumns(message, now);
    // A reaction sets its emoji on the message it is for and is not a row of its own; an unknown target is kept as a row (I6).
    if (message.kind === "reaction" && message.reaction !== null) {
      const target =
        message.reaction.targetWamid === null
          ? null
          : await tx.whatsappMessage.findFirst({
              where: { wamid: message.reaction.targetWamid },
              select: { id: true },
            });
      if (target !== null) {
        await tx.whatsappMessage.update({
          where: { id: target.id },
          data: { reaction: message.reaction.emoji.slice(0, 32) },
        });
        await stamp(tx, { organizationId, connectionId: connection.id }, now);
        return { repeat: false, copy: null };
      }
    }
    const stored = await tx.whatsappMessage.createManyAndReturn({
      data: [
        {
          ...columns,
          conversationId: conversation.id,
          direction: "in",
          origin: "customer",
          status: "received",
          reaction: message.kind === "reaction" ? (message.reaction?.emoji.slice(0, 32) ?? null) : null,
          ...(message.kind === "reaction" ? { quotedWamid: message.reaction?.targetWamid ?? null } : {}),
        },
      ],
      skipDuplicates: true,
      select: { id: true },
    });
    const row = stored[0];
    if (row === undefined) return { repeat: true, copy: null };

    const writing = message.kind !== "reaction";
    let personId = conversation.personId;
    let hidden = conversation.hidden;
    if (facts !== null && writing) {
      const outcome = await receiveWhatsAppContact(
        tx,
        systemActor(organizationId),
        {
          phoneE164,
          profileName: message.customerName,
          firstText: firstTextOf(message),
          occurredAt: columns.occurredAt,
          previousInboundAt: conversation.lastInboundAt,
        },
        { ownerUserId: facts.ownerUserId, workers: facts.workers },
        now,
      );
      personId = outcome.kind === "blocked" ? (outcome.personId ?? personId) : outcome.personId;
      hidden = outcome.kind === "blocked";
      await announce(tx, outcome, {
        conversationId: conversation.id,
        messageId: row.id,
        wasWaiting: conversation.needsReply,
      });
    }
    if (writing && personId !== null && isOptOutText(message.text)) {
      await recordWhatsappOptOut(tx, systemActor(organizationId), { personId, now: columns.occurredAt });
    }
    await tx.whatsappConversation.update({
      where: { id: conversation.id },
      data: {
        personId,
        hidden,
        profileName: (message.customerName?.trim().slice(0, 200) ?? "") || conversation.profileName,
        ...(writing ? { lastInboundAt: later(conversation.lastInboundAt, columns.occurredAt), needsReply: true } : {}),
        ...(conversation.lastMessageAt === null || columns.occurredAt.getTime() >= conversation.lastMessageAt.getTime()
          ? { lastMessageAt: columns.occurredAt, lastMessageId: row.id }
          : {}),
      },
    });
    await stamp(tx, { organizationId, connectionId: connection.id }, now, facts?.timeZone);
    return { repeat: false, copy: columns.mediaState === "pending" ? row.id : null };
  });
  if (repeat) return "repeat";
  if (copy !== null) {
    // Queued after the commit; the health job queues what a crash here left pending. The id makes a repeat queue nothing.
    await dependencies.queue.send(
      COPY_MEDIA_QUEUE,
      { organizationId, messageId: copy },
      { id: copy, retryLimit: 10, retryDelaySeconds: 60 },
    );
  }
  return "stored";
}

/** The events that tell the owner (spec 4.8), once per burst: only when the chat was not already waiting for a reply. */
async function announce(
  tx: OrgTx,
  outcome: WhatsAppContactOutcome,
  ids: { conversationId: string; messageId: string; wasWaiting: boolean },
): Promise<void> {
  if (ids.wasWaiting) return;
  const payload = { conversationId: ids.conversationId, messageId: ids.messageId };
  if (outcome.kind === "on_open_lead") await publishEvent(tx, { type: "whatsapp.message-received", payload });
  if (outcome.kind === "past_customer") await publishEvent(tx, { type: "whatsapp.past-customer-wrote", payload });
}

/** Stamps the connection's last event (and last inbound), counts the message in the month's usage, and ends a problem. */
async function stamp(
  tx: OrgTx,
  scope: { organizationId: string; connectionId: string },
  now: Date,
  timeZone = "Asia/Kolkata",
): Promise<void> {
  const connection = await tx.whatsappConnection.update({
    where: { id: scope.connectionId },
    data: { lastEventAt: now, lastInboundAt: now },
    select: { status: true },
  });
  await bumpUsage(tx, scope, monthStartOf(now, timeZone), { inbound: 1 });
  if (connection.status === "problem") {
    await tx.whatsappConnection.update({
      where: { id: scope.connectionId },
      data: { status: "connected", problemSince: null },
    });
  }
}
