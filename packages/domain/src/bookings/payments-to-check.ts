// The list of payments waiting for a person to check: customers' claims, AI bookings with a proof, and screenshots no booking
// waits for. Oldest first by id (UUID v7, so by time), 25 a page, within the member's lead scope. Only a person decides them.
import type { PaymentToCheck, PaymentsToCheckPage } from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { scopeFilter, type MemberAccess } from "../identity/index.js";

const PAGE_SIZE = 25;

/** Which leads the member sees: every one, or only their own (a proof with no lead is then not theirs to see). */
function leadScope(access: MemberAccess) {
  const owned = scopeFilter(access, "bookings:view", "ownerUserId");
  return Object.keys(owned).length === 0 ? null : owned;
}

/** The amount as the AI wrote it down, if it wrote one. */
const noteOf = (details: unknown) => {
  const amount = ((details ?? {}) as Record<string, unknown>).amount;
  return typeof amount === "string" && amount.trim() !== "" ? amount.trim() : null;
};

const afterCursor = (cursor: string | undefined) => (cursor === undefined ? {} : { id: { gt: cursor } });
const day = (date: Date | null) => (date === null ? null : date.toISOString().slice(0, 10));

async function claims(tx: OrgTx, access: MemberAccess, cursor: string | undefined): Promise<PaymentToCheck[]> {
  const scope = leadScope(access);
  const rows = await tx.paymentClaim.findMany({
    where: { status: "pending", ...afterCursor(cursor), ...(scope === null ? {} : { booking: { lead: scope } }) },
    orderBy: { id: "asc" },
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      createdAt: true,
      amountPaise: true,
      reference: true,
      screenshotFileId: true,
      bookingId: true,
      installment: { select: { amountPaise: true } },
      booking: {
        select: {
          leadId: true,
          startDate: true,
          quote: { select: { title: true } },
          lead: { select: { person: { select: { name: true } } } },
        },
      },
    },
  });
  return rows.map((row) => ({
    kind: "claim",
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    waitingSince: row.createdAt.toISOString(),
    person: { name: row.booking.lead.person.name, leadId: row.booking.leadId },
    trip: row.booking.quote.title,
    date: day(row.booking.startDate),
    // The instalment the customer paid against; a claim on no instalment has no amount asked.
    expectedPaise: row.installment === null ? null : Number(row.installment.amountPaise),
    claimedPaise: Number(row.amountPaise),
    aiNote: null,
    reference: row.reference === "" ? null : row.reference,
    screenshot: row.screenshotFileId === null ? null : { kind: "claim_file", id: row.screenshotFileId },
    conversationId: null,
    bookingId: row.bookingId,
  }));
}

async function aiBookings(tx: OrgTx, access: MemberAccess, cursor: string | undefined): Promise<PaymentToCheck[]> {
  const scope = leadScope(access);
  const rows = await tx.aiBooking.findMany({
    where: { status: "proof_received", ...afterCursor(cursor), ...(scope === null ? {} : { lead: scope }) },
    orderBy: { id: "asc" },
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      createdAt: true,
      summary: true,
      details: true,
      expectedPaise: true,
      proofMessageIds: true,
      conversationId: true,
      leadId: true,
      lead: { select: { person: { select: { name: true } } } },
    },
  });
  const proofIds = rows.flatMap((row) => row.proofMessageIds.slice(-1));
  const proofTimes = new Map(
    (
      await tx.whatsappMessage.findMany({ where: { id: { in: proofIds } }, select: { id: true, occurredAt: true } })
    ).map((message) => [message.id, message.occurredAt]),
  );
  return rows.map((row) => {
    const proofId = row.proofMessageIds.at(-1);
    const proofAt = proofId === undefined ? undefined : proofTimes.get(proofId);
    return {
      kind: "ai_booking",
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      waitingSince: (proofAt ?? row.createdAt).toISOString(),
      person: { name: row.lead.person.name, leadId: row.leadId },
      trip: row.summary,
      // The AI wrote the dates as the customer said them, so there is no calendar day to show.
      date: null,
      // Only an advance code worked out is expected; what the AI wrote as the amount is its note, for the person to read.
      expectedPaise: row.expectedPaise === null ? null : Number(row.expectedPaise),
      aiNote: row.expectedPaise === null ? noteOf(row.details) : null,
      claimedPaise: null,
      reference: null,
      screenshot: proofId === undefined ? null : { kind: "chat_message", id: proofId },
      conversationId: row.conversationId,
      bookingId: null,
    };
  });
}

async function proofs(tx: OrgTx, access: MemberAccess, cursor: string | undefined): Promise<PaymentToCheck[]> {
  const scope = leadScope(access);
  const rows = await tx.paymentProof.findMany({
    where: { status: "pending", ...afterCursor(cursor), ...(scope === null ? {} : { lead: scope }) },
    orderBy: { id: "asc" },
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      createdAt: true,
      messageId: true,
      conversationId: true,
      leadId: true,
      lead: { select: { person: { select: { name: true } } } },
      conversation: { select: { profileName: true, phoneE164: true, person: { select: { name: true } } } },
    },
  });
  return rows.map((row) => ({
    kind: "proof",
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    waitingSince: row.createdAt.toISOString(),
    person: {
      name:
        row.lead?.person.name ??
        row.conversation.person?.name ??
        row.conversation.profileName ??
        // An erased chat's number is replaced by a marker, which is no number to show.
        (row.conversation.phoneE164.startsWith("erased:") ? "" : row.conversation.phoneE164),
      leadId: row.leadId,
    },
    trip: null,
    date: null,
    expectedPaise: null,
    claimedPaise: null,
    aiNote: null,
    reference: null,
    screenshot: { kind: "chat_message", id: row.messageId },
    conversationId: row.conversationId,
    bookingId: null,
  }));
}

/** One page of what waits, oldest first. The cursor is the last id shown; ids of all three kinds are UUID v7. */
export async function paymentsToCheck(
  tx: OrgTx,
  access: MemberAccess,
  input: { cursor?: string | undefined },
): Promise<PaymentsToCheckPage> {
  // Each source gives at most a page past the cursor, so the merged first page is exactly the oldest 25.
  const merged = [
    ...(await claims(tx, access, input.cursor)),
    ...(await aiBookings(tx, access, input.cursor)),
    ...(await proofs(tx, access, input.cursor)),
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const items = merged.slice(0, PAGE_SIZE);
  return { items, nextCursor: merged.length > PAGE_SIZE ? (items.at(-1)?.id ?? null) : null };
}

/** How many payments wait for the member, for the badge. */
export async function countPaymentsToCheck(tx: OrgTx, access: MemberAccess): Promise<number> {
  const scope = leadScope(access);
  const claimCount = await tx.paymentClaim.count({
    where: { status: "pending", ...(scope === null ? {} : { booking: { lead: scope } }) },
  });
  const aiCount = await tx.aiBooking.count({
    where: { status: "proof_received", ...(scope === null ? {} : { lead: scope }) },
  });
  const proofCount = await tx.paymentProof.count({
    where: { status: "pending", ...(scope === null ? {} : { lead: scope }) },
  });
  return claimCount + aiCount + proofCount;
}

/**
 * Of the member's open tasks due before `before`, the "Check payment" tasks of pending claims they see: Today counts each
 * such claim once, in the payments to check, not again as a task.
 */
export async function countClaimTasks(tx: OrgTx, access: MemberAccess, before: Date): Promise<number> {
  const scope = leadScope(access);
  const claims = await tx.paymentClaim.findMany({
    where: { status: "pending", taskId: { not: null }, ...(scope === null ? {} : { booking: { lead: scope } }) },
    select: { taskId: true },
  });
  const taskIds = claims.flatMap((claim) => (claim.taskId === null ? [] : [claim.taskId]));
  if (taskIds.length === 0) return 0;
  return tx.task.count({
    where: {
      id: { in: taskIds },
      assigneeUserId: access.userId,
      doneAt: null,
      cancelledAt: null,
      dueAt: { lt: before },
    },
  });
}
