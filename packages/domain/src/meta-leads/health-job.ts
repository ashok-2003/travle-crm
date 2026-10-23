// meta.health: once a day, every routed Page is checked (health.ts), one after another so Meta is not hit all at once, and a
// failure of one Page never stops the rest. The log gets counts and codes only.
import type { MetaDependencies } from "./dependencies.js";
import { checkPageHealth, type HealthOutcome } from "./health.js";
import { livePageByMetaId } from "./page-row.js";
import { removeRoute, routesPage } from "./routes.js";

export const META_HEALTH_QUEUE = "meta.health";
const PAGE_SIZE = 100;

export async function checkAllPages(
  dependencies: MetaDependencies,
  now: Date,
): Promise<Record<HealthOutcome | "failed", number>> {
  const counts = { ok: 0, needs_reconnect: 0, skipped: 0, failed: 0 };
  let after: string | undefined;
  for (;;) {
    const routes = await routesPage(dependencies.db, { after, limit: PAGE_SIZE });
    for (const route of routes) {
      try {
        const page = await dependencies.db.forOrg(route.organizationId, (tx) => livePageByMetaId(tx, route.metaPageId));
        if (page === null) {
          // A route no live Page stands behind (a disconnected draft, a Page released): dropped.
          await removeRoute(dependencies.db, route.organizationId, route.metaPageId);
          counts.skipped += 1;
          continue;
        }
        counts[await checkPageHealth(dependencies, page.id, route.organizationId, now)] += 1;
      } catch (error) {
        counts.failed += 1;
        dependencies.logger.error(
          { name: error instanceof Error ? error.name : "unknown" },
          "A Meta Page health check failed",
        );
      }
    }
    if (routes.length < PAGE_SIZE) break;
    after = routes.at(-1)?.id;
  }
  dependencies.logger.info(counts, "The Meta Pages were checked");
  return counts;
}
