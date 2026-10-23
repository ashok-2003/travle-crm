// meta.update-route (M4, spec 5): on meta.page-changed, a Page that is running, paused (still routed, so the webhook is
// ignored on purpose) or needs reconnecting has a route; one that is connecting or disconnected has none. Run twice it is
// the same, and a stale row is harmless: the catch-up re-reads the Page and does nothing. When another agency holds the
// Page already (two connects raced, M4), this one lets go of it.
import { metaPageChangedEvent } from "@travel-crm/contracts/meta-leads";
import { recordAudit } from "../audit/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import type { MetaDependencies } from "./dependencies.js";
import { catchupIntervalSeconds } from "./limits.js";
import { pageOf, routedStatuses } from "./page-row.js";
import { removeRoute, upsertRoute } from "./routes.js";
import { clearedToken } from "./tokens.js";

export function routeListener(dependencies: Pick<MetaDependencies, "db" | "logger">): EventListener {
  return defineListener({
    name: "meta.update-route",
    eventType: "meta.page-changed",
    payload: metaPageChangedEvent,
    handle: async (event, context) => {
      const page = await context.forOrg((tx) => pageOf(tx, event.payload.pageId));
      if (page === null) return;
      if (!routedStatuses.includes(page.status)) {
        await removeRoute(dependencies.db, page.organizationId, page.pageId);
        return;
      }
      const outcome = await upsertRoute(dependencies.db, {
        metaPageId: page.pageId,
        organizationId: page.organizationId,
        metaUserId: page.metaUserId,
        // The first catch-up is a full interval away, spread a little so Pages never all read at once.
        nextCatchupAt: new Date(Date.now() + Math.floor(catchupIntervalSeconds * (0.5 + Math.random() * 0.5)) * 1000),
      });
      if (outcome === "ok") return;
      // Another agency holds the Page: this connection is let go, its token deleted (M4).
      dependencies.logger.warn({ pageRowId: page.id }, "A Meta Page is held by another agency; disconnecting it here");
      await context.forOrg(async (tx) => {
        await tx.metaPage.update({
          where: { id: page.id },
          data: { status: "disconnected", disconnectedAt: new Date(), attentionSince: null, ...clearedToken },
        });
        await recordAudit(tx, context.actor, {
          action: "meta.page-disconnected",
          entityType: "meta_page",
          entityId: page.id,
          before: { status: page.status },
          after: { status: "disconnected" },
        });
      });
    },
  });
}
