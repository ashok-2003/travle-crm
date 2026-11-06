// Payments to check: a screenshot or PDF a customer sends while no booking waits for payment is kept as a proof for a person
// to match against a payment. Recorded once per chat message; the team is told once; a person may dismiss it (audited).
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { scopeFilter, type MemberAccess } from "../identity/index.js";
import { noticeKey } from "../crm/index.js";
import { DomainError, type Actor, type CalendarDate } from "../kernel/index.js";
import { notify } from "../notifications/index.js";

export const PAYMENT_PROOF_KIND = "payment.proof-to-match";

/** The title of a notice about a customer's photo or file: it may be a payment, nothing more is claimed. */
export const mayBePaymentTitle = (name: string | undefined) =>
  `${name ?? "A customer"} sent a photo or file that may be a payment`.slice(0, 120);

/**
 * Keeps the chat message as a pending proof (a second delivery adds nothing) and tells the lead's owner and the managers
 * once a chat an agency day, however many files come. The lead is the person's newest one, when the chat has a person.
 */
export async function recordUnmatchedProof(
  tx: OrgTx,
  actor: Actor,
  input: {
    conversationId: string;
    messageId: string;
    leadId: string | null;
    managerUserIds: readonly string[];
    /** The agency's day the file came on. */
    day: CalendarDate;
  },
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
    sourceEventId: noticeKey(`${input.conversationId}:${input.day}`, PAYMENT_PROOF_KIND),
    kind: PAYMENT_PROOF_KIND,
    title: mayBePaymentTitle(lead?.person.name),
    body: "No booking is waiting for it. If it is a payment, check it against your bank and match it.",
    // The chat holds the screenshot; erasing the customer finds this notice by the chat id in its link.
    link: `/inbox/${input.conversationId}`,
    channels: ["email", "push"],
  });
  return true;
}

/**
 * A person says this proof is nothing to match: it leaves the list. Found through its lead in the member's scope (a proof
 * with no lead is no own-scope member's). Dismissing twice, or after someone else did, records one entry.
 */
export async function dismissProof(tx: OrgTx, access: MemberAccess, input: { proofId: string }): Promise<void> {
  const owned = scopeFilter(access, "bookings:view", "ownerUserId");
  const proof = await tx.paymentProof.findFirst({
    where: { id: input.proofId, ...(Object.keys(owned).length === 0 ? {} : { lead: owned }) },
    select: { id: true, status: true },
  });
  if (proof === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such payment screenshot");
  if (proof.status === "dismissed") return;
  if (proof.status !== "pending") {
    throw new DomainError("CONFLICT", "PROOF_DECIDED", "This payment screenshot was already checked");
  }
  // Only a proof still pending moves: one decided meanwhile is left as it was, with no second entry.
  const moved = await tx.paymentProof.updateMany({
    where: { id: proof.id, status: "pending" },
    data: { status: "dismissed", decidedBy: access.userId, decidedAt: new Date() },
  });
  if (moved.count === 0) return;
  await recordAudit(tx, access, {
    action: "payment-proof.dismissed",
    entityType: "payment_proof",
    entityId: proof.id,
    before: { status: "pending" },
    after: { status: "dismissed" },
  });
}
