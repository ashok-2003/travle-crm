// Broadcasts (sales inbox spec 6, rebuilt 2026-10-26): confirming one snapshots its audience into recipient rows in one
// transaction and publishes an event; the worker sends (broadcast-send.ts). The browser's request id makes a retried create
// the broadcast it made already. Cancel, resume and the list are here too. Everything is audited; nothing holds a rupee.
import {
  broadcastDetail,
  type BroadcastCounts,
  type BroadcastDetail,
  type BroadcastIdInput,
  type BroadcastPreview,
  type BroadcastPreviewInput,
  type BroadcastSummary,
  type CreateBroadcastInput,
} from "@travel-crm/contracts/inbox";
import { joinSql, sql, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError } from "../kernel/index.js";
import { broadcastAudience } from "./broadcast-audience.js";
import { chatNameOf } from "./chat-name.js";
import { liveConnection } from "./connection-row.js";
import { renderTemplate } from "./template-send.js";

/** WhatsApp's refusals that say something is wrong with the sending (a customer's number not being on WhatsApp is not one). */
export const REFUSALS_OF_OURS = ["other", "tier_limit"];

/** The event that wakes the worker to send a broadcast's waiting recipients. */
export const BROADCAST_READY_EVENT = "whatsapp.broadcast-ready";

/**
 * Asks the worker for a batch of the broadcast. One ask waiting to be relayed is enough: the create, a resume, a batch's
 * own continuation and the minute job all ask, and the asks must not stack into parallel chains.
 */
export async function askForBatch(tx: OrgTx, broadcastId: string): Promise<void> {
  const waiting = await tx.outboxEvent.findFirst({
    where: { type: BROADCAST_READY_EVENT, relayedAt: null, payload: { path: ["broadcastId"], equals: broadcastId } },
    select: { id: true },
  });
  if (waiting === null) await publishEvent(tx, { type: BROADCAST_READY_EVENT, payload: { broadcastId } });
}

export async function previewBroadcast(
  tx: OrgTx,
  access: MemberAccess,
  input: BroadcastPreviewInput,
  now: Date,
): Promise<BroadcastPreview> {
  return (await broadcastAudience(tx, access, input, now)).preview;
}

/** Makes the broadcast: its row, its tags and a row for each recipient, and the event for the worker. Once per request id. */
export async function createBroadcast(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateBroadcastInput,
  now: Date,
): Promise<{ id: string }> {
  const earlier = await tx.whatsappBroadcast.findFirst({ where: { requestId: input.requestId }, select: { id: true } });
  if (earlier !== null) return earlier;
  const connection = await liveConnection(tx);
  if (connection === null || connection.status === "setup" || connection.mode === "demo") {
    throw new DomainError("CONFLICT", "WHATSAPP_NOT_CONNECTED", "WhatsApp is not set up for this agency");
  }
  // Two broadcasts made at once must not both take the last of the allowance: the connection's row is held, as a send does.
  await tx.$queryRaw`SELECT id FROM whatsapp_connection WHERE id = ${connection.id}::uuid FOR UPDATE`;
  const audience = await broadcastAudience(tx, access, input, now);
  if (audience.chatIds.length === 0) {
    throw new DomainError("VALIDATION", "BROADCAST_NO_RECIPIENTS", "No chat would receive this broadcast");
  }
  const [row] = await tx.whatsappBroadcast.createManyAndReturn({
    data: [
      {
        requestId: input.requestId,
        templateId: audience.template.id,
        params: input.params,
        segments: audience.segments,
        createdBy: access.userId,
      },
    ],
    skipDuplicates: true,
    select: { id: true },
  });
  if (row === undefined) {
    // A twin request made it between the look above and here.
    return tx.whatsappBroadcast.findFirstOrThrow({ where: { requestId: input.requestId }, select: { id: true } });
  }
  await tx.whatsappBroadcastTag.createMany({
    data: audience.tags.map((tag) => ({ broadcastId: row.id, tagId: tag.id })),
  });
  await tx.whatsappBroadcastRecipient.createMany({
    data: audience.chatIds.map((conversationId) => ({ broadcastId: row.id, conversationId, notBefore: now })),
  });
  await askForBatch(tx, row.id);
  await recordAudit(tx, access, {
    action: "inbox.broadcast-created",
    entityType: "whatsapp_broadcast",
    entityId: row.id,
    after: {
      template: audience.template.name,
      tags: audience.tags.map((tag) => tag.name).join(", "),
      segments: audience.segments.join(", "),
      total: audience.chatIds.length,
    },
  });
  return row;
}

/** Each broadcast's recipients by where they stand. A "sent" one whose message WhatsApp then refused counts as failed. */
async function countsOf(tx: OrgTx, broadcastIds: string[]): Promise<Map<string, BroadcastCounts>> {
  const counts = new Map<string, BroadcastCounts>(
    broadcastIds.map((id) => [id, { total: 0, waiting: 0, sent: 0, skipped: 0, failed: 0, refused: 0 }]),
  );
  if (broadcastIds.length === 0) return counts;
  const rows = await tx.$queryRaw<{ id: string; state: string; n: number; refused: number }[]>(sql`
    SELECT r.broadcast_id AS id,
      CASE WHEN r.state = 'sent' AND m.status = 'failed' THEN 'failed' ELSE r.state END AS state,
      count(*)::int AS n,
      count(*) FILTER (WHERE m.status = 'failed' AND m.failure_code IN (${joinSql(REFUSALS_OF_OURS.map((code) => sql`${code}`))}))::int AS refused
    FROM whatsapp_broadcast_recipient r
    LEFT JOIN whatsapp_message m ON m.organization_id = r.organization_id AND m.id = r.message_id
    WHERE r.broadcast_id IN (${joinSql(broadcastIds.map((id) => sql`${id}::uuid`))})
    GROUP BY 1, 2`);
  for (const { id, state, n, refused } of rows) {
    const held = counts.get(id);
    if (held === undefined) continue;
    held.total += n;
    held.refused += refused;
    if (state === "waiting" || state === "sent" || state === "skipped" || state === "failed") held[state] += n;
  }
  return counts;
}

async function summaries(tx: OrgTx, ids: string[]): Promise<BroadcastSummary[]> {
  const rows = await tx.whatsappBroadcast.findMany({
    where: { id: { in: ids } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      status: true,
      pausedReason: true,
      createdBy: true,
      createdAt: true,
      params: true,
      segments: true,
      template: { select: { name: true, body: true } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });
  const counts = await countsOf(tx, ids);
  const none: BroadcastCounts = { total: 0, waiting: 0, sent: 0, skipped: 0, failed: 0, refused: 0 };
  return rows.map((row) => ({
    id: row.id,
    templateName: row.template.name,
    message: renderTemplate(row.template.body, row.params),
    tagNames: row.tags.map((link) => link.tag.name).sort(),
    segments: row.segments.filter((segment): segment is "lost" | "won" => segment === "lost" || segment === "won"),
    status: row.status as BroadcastSummary["status"],
    pausedReason: row.pausedReason as BroadcastSummary["pausedReason"],
    counts: counts.get(row.id) ?? none,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** The newest broadcasts with their live counts; the router adds the creators' names. */
export async function listBroadcasts(tx: OrgTx): Promise<{ items: BroadcastSummary[] }> {
  const recent = await tx.whatsappBroadcast.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 30,
    select: { id: true },
  });
  return {
    items: await summaries(
      tx,
      recent.map((row) => row.id),
    ),
  };
}

/** One broadcast and a page of its recipients, newest first; the router adds names. */
export async function broadcastDetailOf(
  tx: OrgTx,
  input: { broadcastId: string; before?: string | undefined; limit: number },
  now: Date = new Date(),
): Promise<Omit<BroadcastDetail, "people">> {
  const [broadcast] = await summaries(tx, [input.broadcastId]);
  if (broadcast === undefined) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const rows = await tx.whatsappBroadcastRecipient.findMany({
    where: { broadcastId: input.broadcastId, ...(input.before === undefined ? {} : { id: { lt: input.before } }) },
    orderBy: { id: "desc" },
    take: input.limit + 1,
    select: {
      id: true,
      conversationId: true,
      state: true,
      reason: true,
      notBefore: true,
      conversation: { select: { phoneE164: true, profileName: true, person: { select: { name: true } } } },
      message: { select: { status: true, failureCode: true } },
    },
  });
  const page = rows.slice(0, input.limit);
  return broadcastDetail.omit({ people: true }).parse({
    broadcast,
    recipients: page.map((row) => {
      const refused = row.state === "sent" && row.message?.status === "failed";
      return {
        id: row.id,
        conversationId: row.conversationId,
        name: chatNameOf(row.conversation),
        phone: row.conversation.phoneE164,
        state: refused ? "failed" : row.state,
        reason: refused ? (row.message?.failureCode ?? "other") : row.reason,
        // Only a recipient made to wait for a later moment shows it.
        notBefore:
          row.state === "waiting" && row.notBefore.getTime() > now.getTime() ? row.notBefore.toISOString() : null,
      };
    }),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  });
}

async function ownBroadcast(tx: OrgTx, access: MemberAccess, id: string) {
  const row = await tx.whatsappBroadcast.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  // Whoever writes the agency's templates (the Owner and Admins): the router asks for it too.
  if (!access.permissions.has("inbox:templates")) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires inbox:templates");
  }
  return row;
}

/** Stops it: what has not gone is skipped as cancelled, and nothing more is sent. Cancelling a stopped one changes nothing. */
export async function cancelBroadcast(tx: OrgTx, access: MemberAccess, input: BroadcastIdInput, now: Date) {
  const row = await ownBroadcast(tx, access, input.broadcastId);
  if (row.status !== "sending" && row.status !== "paused") return;
  await tx.whatsappBroadcast.update({
    where: { id: row.id },
    data: { status: "cancelled", cancelledBy: access.userId, cancelledAt: now, pausedReason: null },
  });
  // What is queued and not yet with WhatsApp is called back too: the sender sends only what is still queued.
  const recalled = await tx.whatsappMessage.updateMany({
    where: { broadcastId: row.id, status: "queued" },
    data: { status: "superseded" },
  });
  await tx.whatsappBroadcastRecipient.updateMany({
    where: {
      broadcastId: row.id,
      OR: [{ state: "waiting" }, ...(recalled.count > 0 ? [{ message: { is: { status: "superseded" } } }] : [])],
    },
    data: { state: "skipped", reason: "cancelled" },
  });
  await recordAudit(tx, access, {
    action: "inbox.broadcast-cancelled",
    entityType: "whatsapp_broadcast",
    entityId: row.id,
  });
}

/** Sends again what a pause held back. */
export async function resumeBroadcast(tx: OrgTx, access: MemberAccess, input: BroadcastIdInput) {
  const row = await ownBroadcast(tx, access, input.broadcastId);
  if (row.status === "sending") return;
  if (row.status !== "paused") {
    throw new DomainError("CONFLICT", "BROADCAST_NOT_PAUSED", "Only a paused broadcast can be resumed");
  }
  await tx.whatsappBroadcast.update({ where: { id: row.id }, data: { status: "sending", pausedReason: null } });
  await askForBatch(tx, row.id);
  await recordAudit(tx, access, {
    action: "inbox.broadcast-resumed",
    entityType: "whatsapp_broadcast",
    entityId: row.id,
  });
}
