// A sent reply that began as the AI's draft: audited as drafted by AI, sent by the member, with whether the member changed it.
// The draft's row says which member asked for it and what it said (by hash); it is used once.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { hashOf } from "./suggest.js";

/**
 * Records that the message sent in the chat (`messageId`, with the text it was sent as) was drafted by AI. A draft that is
 * not this member's, not this chat's or used already records nothing and is refused as "not found", so the audit never
 * says the AI wrote what it didn't.
 */
export async function recordDraftSent(
  tx: OrgTx,
  access: MemberAccess,
  input: { draftId: string; conversationId: string; messageId: string; text: string },
  now: Date,
): Promise<void> {
  const draft = await tx.aiDraft.findFirst({
    where: { id: input.draftId, conversationId: input.conversationId, draftedBy: access.userId },
    select: { id: true, textHash: true, usedAt: true, model: true },
  });
  if (draft === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  // The same send again (a retry with the same token) finds it recorded: nothing more to say.
  if (draft.usedAt !== null) return;
  await tx.aiDraft.update({ where: { id: draft.id }, data: { usedAt: now } });
  await recordAudit(tx, access, {
    action: "ai.draft-sent",
    entityType: "ai_draft",
    entityId: draft.id,
    after: {
      messageId: input.messageId,
      model: draft.model,
      changedByMember: hashOf(input.text) !== draft.textHash,
    },
  });
}
