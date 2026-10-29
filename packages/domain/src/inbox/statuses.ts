// Delivery statuses (spec 4.5): a status event moves the message with that wamid forward, never back, and is the proof that
// reports still arrive. A status for a message we don't have yet is tried again by the intake (MSG91 can be faster than our
// own save of the send's answer); one for a message older than two minutes with no row is dropped and counted.
import type { OrgTx } from "@travel-crm/db";
import { ownMessage } from "@travel-crm/integrations/jobs";
import type { ParsedEvent } from "@travel-crm/integrations/whatsapp";
import { bumpUsage, monthStartOf } from "./usage.js";

type StatusEvent = Extract<ParsedEvent, { type: "status" }>;

const rank: Readonly<Record<string, number>> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4 };

/** How long a status may wait for its message before it is given up (D2). */
const GIVE_UP_MS = 2 * 60_000;

export type StatusResult = "applied" | "ignored" | "dropped";

/** Applies one status in the connection's organization. Throws a retryable error for a message that may still be coming. */
export async function applyStatus(
  tx: OrgTx,
  scope: { organizationId: string; connectionId: string },
  event: StatusEvent,
  now: Date,
  timeZone = "Asia/Kolkata",
): Promise<StatusResult> {
  const reportStamp = { lastEventAt: now, lastReportAt: now };
  const message = await tx.whatsappMessage.findFirst({
    where: { wamid: event.wamid },
    select: { id: true, status: true, direction: true, deliveredAt: true },
  });
  if (message === null) {
    const at = event.occurredAt ?? now;
    if (now.getTime() - at.getTime() > GIVE_UP_MS) {
      await tx.whatsappConnection.update({
        where: { id: scope.connectionId },
        data: { ...reportStamp, eventsUnknown: { increment: 1 } },
      });
      return "dropped";
    }
    throw ownMessage(new Error("A WhatsApp status arrived before its message"));
  }
  const connection = await tx.whatsappConnection.update({
    where: { id: scope.connectionId },
    data: reportStamp,
    select: { status: true },
  });
  if (connection.status === "problem") {
    await tx.whatsappConnection.update({
      where: { id: scope.connectionId },
      data: { status: "connected", problemSince: null },
    });
  }
  const at = event.occurredAt ?? now;
  if (event.status === "failed") {
    if (message.status === "delivered" || message.status === "read") return "ignored";
    await tx.whatsappMessage.update({
      where: { id: message.id },
      data: { status: "failed", failureCode: (event.reasonCode ?? "unknown").slice(0, 100) },
    });
    await bumpUsage(tx, scope, monthStartOf(now, timeZone), { failed: 1 });
    return "applied";
  }
  // A late "sent" does not undo a recorded failure; a delivered or read does (the message did arrive).
  if (message.status === "failed" && event.status === "sent") return "ignored";
  if ((rank[event.status] ?? 0) <= (rank[message.status] ?? 0)) return "ignored";
  await tx.whatsappMessage.update({
    where: { id: message.id },
    data: {
      status: event.status,
      ...(event.status === "sent" ? { sentAt: at } : {}),
      ...(event.status === "delivered" ? { deliveredAt: at } : {}),
      // A read that arrives first is also the delivery; one after a delivery leaves the delivery's own time alone.
      ...(event.status === "read" ? { readAt: at, deliveredAt: message.deliveredAt ?? at } : {}),
    },
  });
  return "applied";
}
