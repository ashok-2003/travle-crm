// A chat's photos and videos we hold, newest first, a page at a time: the contact panel's gallery. The same message shape as the
// chat's own list, so the viewer opens them as it opens one from a bubble, and with each one's link signed in the same pass,
// so the gallery makes one call for a page of at most 60 pictures, not one per picture. The chat is checked as for any read.
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import {
  chatMediaPage,
  chatMessagePage,
  type ChatMediaPage,
  type ListChatMediaInput,
  type MediaLink,
} from "@travel-crm/contracts/inbox";
import type { Database } from "@travel-crm/db";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { mediaLinkFor } from "./chat-actions.js";
import { chatMessagesOf, visibleConversation } from "./views.js";

export async function listChatMedia(
  dependencies: { db: Database; files: Files },
  access: MemberAccess,
  input: ListChatMediaInput,
): Promise<ChatMediaPage> {
  const page = await dependencies.db.forOrg(access.organizationId, async (tx) => {
    await visibleConversation(tx, access, input.conversationId);
    const after =
      input.before === undefined
        ? null
        : await tx.whatsappMessage.findFirst({
            where: { id: input.before, conversationId: input.conversationId },
            select: { id: true, occurredAt: true },
          });
    // A place in this chat's pictures that is not in this chat: asked for by someone who was not handed it by us.
    if (input.before !== undefined && after === null) {
      throw new DomainError("NOT_FOUND", "MEDIA_CURSOR_NOT_FOUND", "That place in the photos is not in this chat");
    }
    const rows = await tx.whatsappMessage.findMany({
      where: {
        conversationId: input.conversationId,
        kind: { in: ["image", "video"] },
        mediaState: "stored",
        status: { not: "superseded" },
        ...(after === null
          ? {}
          : { OR: [{ occurredAt: { lt: after.occurredAt } }, { occurredAt: after.occurredAt, id: { lt: after.id } }] }),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    const shown = rows.slice(0, input.limit);
    // The messages are shaped by the chat's own list code, so a media message looks the same here as in the chat.
    return chatMessagePage.parse({
      unread: null,
      items: await chatMessagesOf(tx, input.conversationId, shown),
      people: {},
      nextCursor: rows.length > input.limit ? (shown.at(-1)?.id ?? null) : null,
    });
  });
  // The links are signed outside the read (the files module opens its own), one query for every file of the page.
  const files = await dependencies.files.listForRecords(
    access,
    WHATSAPP_RECORD_TYPE,
    page.items.map((message) => message.id),
  );
  const signed = await Promise.all(
    page.items.map(async (message): Promise<[string, MediaLink] | null> => {
      const [file] = files.get(message.id) ?? [];
      return file === undefined ? null : [message.id, await mediaLinkFor(dependencies.files, access, message.id, file)];
    }),
  );
  return chatMediaPage.parse({
    ...page,
    links: Object.fromEntries(signed.filter((entry): entry is [string, MediaLink] => entry !== null)),
  });
}
