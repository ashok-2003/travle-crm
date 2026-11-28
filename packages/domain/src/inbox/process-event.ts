// The webhook provider's work (spec 4.2 W4, ADR 0035), one stored event in the worker, at least once. The body is parsed into
// events and each is handled on its own, so one bad event never blocks its neighbours; the first failure is rethrown after
// every event had its turn, so the intake retries with backoff and the unique wamid makes the overlap free. The stored
// event is tied to its agency with isAbout as soon as the number's route is found.
import { parseMsg91Event, type ParsedEvent } from "@travel-crm/integrations/whatsapp";
import type { WebhookProcessing } from "../webhooks/index.js";
import { receiveChange } from "./change.js";
import { connectionById } from "./connection-row.js";
import type { InboxDependencies } from "./dependencies.js";
import { receiveEcho } from "./echo.js";
import { receiveInbound } from "./inbound.js";
import { noteUnrouted, routeOfNumber } from "./routes.js";
import { applyStatus } from "./statuses.js";

type StatusEvent = Extract<ParsedEvent, { type: "status" }>;

/**
 * MSG91's own reason for refusing a send of ours ("insufficient balance", a blocked country), which the platform fixes;
 * null for anything else. Our sends' reports carry MSG91's request id (the phone app's don't), and WhatsApp's
 * per-customer codes start with their number ("131026: Message undeliverable").
 */
function msg91Refusal(event: StatusEvent): string | null {
  if (event.status !== "failed" || event.requestId === null) return null;
  const reason = event.reasonCode?.trim() ?? "";
  return reason === "" || /^\d/.test(reason) ? null : reason;
}

async function handleEvent(
  dependencies: InboxDependencies,
  processing: WebhookProcessing,
  event: ParsedEvent,
  now: Date,
): Promise<void> {
  if (event.integratedNumber === null) return;
  const route = await routeOfNumber(dependencies.db, event.integratedNumber);
  if (route === null) {
    // A number nobody recorded: counted so the console can show it, and nothing else happens (R5).
    await noteUnrouted(dependencies.db, event.integratedNumber, now);
    return;
  }
  processing.isAbout(route.organizationId);
  const { organizationId } = route;
  const connection = await dependencies.db.forOrg(organizationId, (tx) => connectionById(tx, route.connectionId));
  if (connection === null || connection.status === "disconnected") return;

  if (connection.status === "setup") {
    // A number being set up only proves the webhook works: it is stamped and nothing is turned into a lead.
    await dependencies.db.forOrg(organizationId, (tx) =>
      tx.whatsappConnection.update({ where: { id: connection.id }, data: { lastEventAt: now } }),
    );
    return;
  }
  switch (event.type) {
    case "inbound":
      // A content type we don't read shows as "unsupported" in the chat: its name (never its words) says what to add.
      if (event.unknownType !== undefined) {
        dependencies.logger.warn(
          { event: "whatsapp.unknown-type", organizationId, contentType: event.unknownType },
          "A WhatsApp message of a type we don't read",
        );
      }
      await receiveInbound(dependencies, organizationId, connection, event, now);
      return;
    case "echo":
      await receiveEcho(dependencies, organizationId, connection, event, now);
      return;
    case "status": {
      // The console hears it first (the owner, 2026-11-28), even when the report finds no message of ours.
      const refusal = msg91Refusal(event);
      if (refusal !== null) dependencies.incidents?.report("whatsapp.refused", refusal);
      await dependencies.db.forOrg(organizationId, (tx) =>
        applyStatus(tx, { organizationId, connectionId: connection.id }, event, now),
      );
      return;
    }
    case "change":
      await receiveChange(dependencies, organizationId, connection, event, now);
      return;
    case "ignored":
      // An edit or a deletion that names no original: no row, no answer, no count.
      return;
    case "unknown":
      await dependencies.db.forOrg(organizationId, (tx) =>
        tx.whatsappConnection.update({
          where: { id: connection.id },
          data: { lastEventAt: now, eventsUnknown: { increment: 1 } },
        }),
      );
      return;
  }
}

/** Handles every event in a stored webhook body. */
export async function processWhatsAppBody(
  dependencies: InboxDependencies,
  processing: WebhookProcessing,
  payload: string,
  now: Date,
): Promise<void> {
  let failure: unknown = null;
  for (const event of parseMsg91Event(payload)) {
    try {
      await handleEvent(dependencies, processing, event, now);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== null) throw failure instanceof Error ? failure : new Error("A WhatsApp event failed");
}
