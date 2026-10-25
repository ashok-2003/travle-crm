// whatsapp.update-route (ADR 0035): on whatsapp.connection-changed, a connection that is setting up, connected, paused or in
// trouble has a route; a disconnected one has none. Run twice it is the same, and a stale row is harmless. When another
// agency holds the number already (two connects raced), this one lets go of it.
import { whatsappConnectionChangedEvent } from "@travel-crm/contracts/inbox";
import { recordAudit } from "../audit/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import type { InboxDependencies } from "./dependencies.js";
import { connectionById } from "./connection-row.js";
import { removeRoute, upsertRoute } from "./routes.js";

export function routeListener(dependencies: Pick<InboxDependencies, "db" | "logger">): EventListener {
  return defineListener({
    name: "whatsapp.update-route",
    eventType: "whatsapp.connection-changed",
    payload: whatsappConnectionChangedEvent,
    handle: async (event, context) => {
      const connection = await context.forOrg((tx) => connectionById(tx, event.payload.connectionId));
      if (connection === null) return;
      if (connection.status === "disconnected") {
        await removeRoute(dependencies.db, connection.organizationId, connection.id);
        return;
      }
      if (connection.mode === "demo") return;
      const outcome = await upsertRoute(dependencies.db, {
        integratedNumber: connection.integratedNumber,
        organizationId: connection.organizationId,
        connectionId: connection.id,
      });
      if (outcome === "ok") return;
      // Another agency holds the number: this connection is let go (the console shows it as disconnected).
      dependencies.logger.warn(
        { connectionId: connection.id },
        "A WhatsApp number is held by another agency; disconnecting",
      );
      await context.forOrg(async (tx) => {
        await tx.whatsappConnection.update({
          where: { id: connection.id },
          data: { status: "disconnected", disconnectedAt: new Date() },
        });
        await recordAudit(tx, context.actor, {
          action: "whatsapp.disconnected",
          entityType: "whatsapp_connection",
          entityId: connection.id,
          before: { status: connection.status },
          after: { status: "disconnected" },
        });
      });
    },
  });
}
