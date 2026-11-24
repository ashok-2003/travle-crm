// An edit or a deletion of a message (inbox revamp spec item 12): it lands on the message it belongs to and is no message of
// its own, so it wakes nothing a new message wakes (the chat's wait, its unread count, the automatic answers, the usage). An
// edit sets the new words and `edited_at`; a deletion for everyone sets `revoked_at` and keeps the words for the team. The
// bubble shows the preview from the same row, so an edit of the last message changes the list line too. An edit whose original
// was never stored is kept as a text message marked edited; a deletion of one we never stored is ignored. Both are safe to
// run twice.
import { toE164 } from "@travel-crm/contracts/kernel";
import type { ParsedEvent, ParsedMessage } from "@travel-crm/integrations/whatsapp";
import type { ConnectionRow } from "./connection-row.js";
import type { InboxDependencies } from "./dependencies.js";
import { receiveEcho } from "./echo.js";
import { receiveInbound } from "./inbound.js";
import { boundedText } from "./messages.js";

type Change = Extract<ParsedEvent, { type: "change" }>;

/** An edit whose original is not stored, as the text message it would have been. */
function asTextMessage(change: Change, text: string): ParsedMessage {
  return {
    wamid: change.originalWamid,
    integratedNumber: change.integratedNumber,
    customerNumber: change.customerNumber,
    customerName: change.customerName,
    occurredAt: change.occurredAt,
    kind: "text",
    text,
    caption: null,
    fileName: null,
    mediaUrl: null,
    latitude: null,
    longitude: null,
    quotedWamid: null,
    reaction: null,
    referral: null,
    buttonReplyId: null,
    replyKind: null,
  };
}

export async function receiveChange(
  dependencies: InboxDependencies,
  organizationId: string,
  connection: ConnectionRow,
  change: Change,
  now: Date,
): Promise<void> {
  const phoneE164 = toE164(change.customerNumber);
  if (phoneE164 === null) return;
  // The provider's own time, never later than ours.
  const at = change.occurredAt === null || change.occurredAt.getTime() > now.getTime() ? now : change.occurredAt;
  const inChat = { conversation: { connectionId: connection.id, phoneE164 } };
  const found = await dependencies.db.forOrg(organizationId, async (tx) => {
    const target = await tx.whatsappMessage.findFirst({
      where: { wamid: change.originalWamid, ...inChat },
      select: { id: true },
    });
    if (target === null) return false;
    // A repeated deletion keeps the first time.
    if (change.kind === "edit") {
      await tx.whatsappMessage.update({
        where: { id: target.id },
        data: { body: boundedText(change.text), editedAt: at },
      });
    } else {
      await tx.whatsappMessage.updateMany({ where: { id: target.id, revokedAt: null }, data: { revokedAt: at } });
    }
    await tx.whatsappConnection.update({ where: { id: connection.id }, data: { lastEventAt: now } });
    return true;
  });
  if (found || change.kind === "revoke" || change.text === null) return;

  const message = asTextMessage(change, change.text);
  if (change.fromPhone) {
    await receiveEcho(dependencies, organizationId, connection, { ...message, requestId: null, ourSend: false }, now);
  } else {
    await receiveInbound(dependencies, organizationId, connection, message, now);
  }
  await dependencies.db.forOrg(organizationId, (tx) =>
    tx.whatsappMessage.updateMany({
      where: { wamid: change.originalWamid, editedAt: null, ...inChat },
      data: { editedAt: at },
    }),
  );
}
