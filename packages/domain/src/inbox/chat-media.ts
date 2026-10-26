// A chat's photos and videos we hold, newest first, a page at a time: the contact panel's gallery. The same message shape as the
// chat's own list, so the viewer opens them as it opens one from a bubble.
import { chatMessagePage, type ChatMessagePage, type ListChatMediaInput } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { chatMessagesOf, visibleConversation } from "./views.js";

export async function listChatMedia(
  tx: OrgTx,
  access: MemberAccess,
  input: ListChatMediaInput,
): Promise<ChatMessagePage> {
  await visibleConversation(tx, access, input.conversationId);
  const after =
    input.before === undefined
      ? null
      : await tx.whatsappMessage.findFirst({
          where: { id: input.before, conversationId: input.conversationId },
          select: { id: true, occurredAt: true },
        });
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
  const page = rows.slice(0, input.limit);
  // The messages are shaped by the chat's own list code, so a media message looks the same here as in the chat.
  return chatMessagePage.parse({
    unread: null,
    items: await chatMessagesOf(tx, input.conversationId, page),
    people: {},
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  });
}
