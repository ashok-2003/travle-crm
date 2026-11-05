// Payments to check: a screenshot or PDF a customer sends while no booking waits for payment is kept as a proof for a person
// to match against a payment. Recorded once per chat message; the team is told once; a person may dismiss it (audited).
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { noticeKey } from "../crm/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";

export const PAYMENT_PROOF_KIND = "payment.proof-to-match";

/**
 * Keeps the chat message as a pending proof (a second delivery adds nothing) and tells the lead's owner and the managers
 * once. The lead is the person's newest one, when the chat has a person.
 */
export async function recordUnmatchedProof(
  tx: OrgTx,
  actor: Actor,
  input: { conversationId: string; messageId: string; leadId: string | null; managerUserIds: readonly string[] },
): Promise<boolean> {
  const created = await tx.paymentProof.createMany({
    data: [{ conversationId: input.conversationId, messageId: input.messageId, leadId: input.leadId }],
    skipDuplicates: true,
  });
  if (created.count === 0) return false;
  const lead =
    input.leadId === null
      ? null
      : await tx.lead.findUnique({
          where: { id: input.leadId },
          select: { ownerUserId: true, person: { select: { name: true } } },
        });
  const recipients = [...new Set([...(lead?.ownerUserId == null ? [] : [lead.ownerUserId]), ...input.managerUserIds])];
  if (recipients.length === 0) return true;
  await notify(tx, actor, {
    recipientUserIds: recipients,
    sourceEventId: noticeKey(input.messageId, PAYMENT_PROOF_KIND),
    kind: PAYMENT_PROOF_KIND,
    title: `${lead?.person.name ?? "A customer"} sent a payment screenshot`.slice(0, 120),
    body: "No booking is waiting for it. Check it against your bank and match it to a payment.",
    // The chat holds the screenshot; erasing the customer finds this notice by the chat id in its link.
    link: `/inbox/${input.conversationId}`,
    channels: ["email", "push"],
  });
  return true;
}

/** A person says this proof is nothing to match: it leaves the list. Dismissing twice records one entry. */
export async function dismissProof(tx: OrgTx, access: MemberAccess, input: { proofId: string }): Promise<void> {
  const proof = await tx.paymentProof.findUnique({ where: { id: input.proofId } });
  if (proof === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such payment screenshot");
  if (proof.status === "dismissed") return;
  if (proof.status !== "pending") {
    throw new DomainError("CONFLICT", "PROOF_DECIDED", "This payment screenshot was already checked");
  }
  await tx.paymentProof.update({
    where: { id: proof.id },
    data: { status: "dismissed", decidedBy: access.userId, decidedAt: new Date() },
  });
  await recordAudit(tx, access, {
    action: "payment-proof.dismissed",
    entityType: "payment_proof",
    entityId: proof.id,
    before: { status: "pending" },
    after: { status: "dismissed" },
  });
}
