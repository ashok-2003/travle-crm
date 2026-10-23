// The webhook provider's work (spec 4.2 W4, ADR 0035), one stored event in the worker, at least once. The body is parsed into
// events and each is handled on its own, so one bad event never blocks its neighbours; the first failure is rethrown after
// every event had its turn, so the intake retries with backoff and the unique wamid makes the overlap free. The stored
// event is tied to its agency with isAbout as soon as the number's route is found.
import { parseMsg91Event, type ParsedEvent } from "@travel-crm/integrations/whatsapp";
import type { WebhookProcessing } from "../webhooks/index.js";
import { connectionById } from "./connection-row.js";
import type { InboxDependencies } from "./dependencies.js";
import { receiveEcho } from "./echo.js";
import { receiveInbound } from "./inbound.js";
import { noteUnrouted, routeOfNumber } from "./routes.js";
import { applyStatus } from "./statuses.js";

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
      await receiveInbound(dependencies, organizationId, connection, event, now);
      return;
    case "echo":
      await receiveEcho(dependencies, organizationId, connection, event, now);
      return;
    case "status":
      await dependencies.db.forOrg(organizationId, (tx) =>
        applyStatus(tx, { organizationId, connectionId: connection.id }, event, now),
      );
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
