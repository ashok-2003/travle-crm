// The connection's health (spec 8.4), every five minutes over connected numbers: our own sends prove the delivery-report path
// is down without needing customers to message. Messages sent more than 20 minutes ago with no status, and no report seen since,
// mean the webhook is probably dead or paused: the connection is `problem`, with a log line at error level. A row left `sending`
// over two minutes is `failed/unsure`; media still pending is queued again. The connection returns to connected by itself when
// a status or an inbound event arrives (inbound.ts and statuses.ts).
import type { InboxDependencies } from "./dependencies.js";
import { COPY_MEDIA_QUEUE } from "./dependencies.js";
import { routesPage } from "./routes.js";
import { failStuckReplies } from "./stuck.js";

const NO_REPORT_AFTER_MS = 20 * 60_000;
const SENDING_STUCK_MS = 2 * 60_000;
/** A reply still waiting in the queue after this long is failed, so Try again appears. */
const QUEUED_FAILS_MS = 5 * 60_000;
const PAGE = 100;

/** Checks one connection; returns the status it ends in. */
export async function checkConnection(
  dependencies: InboxDependencies,
  organizationId: string,
  connectionId: string,
  now: Date,
): Promise<"ok" | "problem" | "skipped"> {
  const outcome = await dependencies.db.forOrg(organizationId, async (tx) => {
    const connection = await tx.whatsappConnection.findUnique({
      where: { id: connectionId },
      select: { status: true, lastReportAt: true, problemSince: true, connectedAt: true },
    });
    if (connection?.status !== "connected" && connection?.status !== "problem")
      return { result: "skipped" as const, pending: [] };

    const scope = { organizationId, connectionId };
    // `sentAt` holds the sender's claim time while a row is `sending`.
    await failStuckReplies(
      tx,
      scope,
      { status: "sending", before: new Date(now.getTime() - SENDING_STUCK_MS) },
      "unsure",
      now,
    );
    await failStuckReplies(
      tx,
      scope,
      { status: "queued", before: new Date(now.getTime() - QUEUED_FAILS_MS) },
      "provider_down",
      now,
    );
    const cutoff = new Date(now.getTime() - NO_REPORT_AFTER_MS);
    const unreported = await tx.whatsappMessage.count({
      where: {
        direction: "out",
        origin: { in: ["staff_crm", "automation"] },
        status: "sent",
        wamid: { not: null },
        sentAt: { lt: cutoff },
      },
    });
    const reportSeen = connection.lastReportAt !== null && connection.lastReportAt.getTime() >= cutoff.getTime();
    const silent = unreported > 0 && !reportSeen;
    if (silent && connection.status === "connected") {
      await tx.whatsappConnection.update({
        where: { id: connectionId },
        data: { status: "problem", problemSince: now },
      });
    }
    const pending = await tx.whatsappMessage.findMany({
      where: { mediaState: "pending", createdAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      select: { id: true },
      take: 50,
    });
    return {
      result: silent ? ("problem" as const) : ("ok" as const),
      pending: pending.map((row) => row.id),
    };
  });
  if (outcome.result === "problem") {
    dependencies.logger.error({ connectionId }, "No WhatsApp delivery reports from MSG91 for 20 minutes after sending");
  }
  for (const messageId of outcome.pending) {
    await dependencies.queue.send(
      COPY_MEDIA_QUEUE,
      { organizationId, messageId },
      { id: messageId, retryLimit: 10, retryDelaySeconds: 60 },
    );
  }
  return outcome.result;
}

/** One health pass over every routed connection. */
export async function checkAllConnections(dependencies: InboxDependencies, now: Date): Promise<number> {
  let checked = 0;
  let after: string | undefined;
  for (;;) {
    const page = await routesPage(dependencies.db, { after, limit: PAGE });
    for (const route of page) {
      try {
        if ((await checkConnection(dependencies, route.organizationId, route.connectionId, now)) !== "skipped")
          checked += 1;
      } catch (error) {
        dependencies.logger.error(
          { connectionId: route.connectionId, error: error instanceof Error ? error.name : "unknown" },
          "A WhatsApp health check failed",
        );
      }
    }
    if (page.length < PAGE) return checked;
    after = page.at(-1)?.integratedNumber;
  }
}
