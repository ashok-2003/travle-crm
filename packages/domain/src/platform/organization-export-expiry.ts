// The export's expiry job, which only the console process runs: deletes the parts of exports past their 7 days and
// marks them expired. The row stays, ids and counts only.
import { exportPartKey } from "./organization-export.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/**
 * The expiry job: deletes the parts of every export past its 7 days, then marks it expired. It takes every export
 * due, not just the one whose time came, so a lost job is made up by the next. Returns how many it expired.
 */
export async function expireOrganizationExports(services: PlatformServices, now: Date = new Date()): Promise<number> {
  const PAGE = 100;
  let expired = 0;
  for (;;) {
    const due = await services.platformDb.transaction((tx) =>
      tx.platformExport.findMany({
        where: { state: { not: "expired" }, expiresAt: { lte: now } },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        take: PAGE,
      }),
    );
    for (const row of due) {
      for (let part = 1; part <= row.partsWritten; part += 1) await services.storage.delete(exportPartKey(row, part));
      await services.platformDb.transaction(async (tx) => {
        const marked = await tx.platformExport.updateMany({
          where: { id: row.id, state: { not: "expired" } },
          data: { state: "expired", expiredAt: now },
        });
        if (marked.count === 0) return;
        expired += 1;
        await recordPlatformAudit(
          tx,
          { userId: null },
          {
            action: "organization.export-expired",
            targetType: "organization",
            targetId: row.targetOrganizationId,
            targetOrganizationId: row.targetOrganizationId,
            after: { exportId: row.id, parts: row.partsWritten },
          },
        );
      });
    }
    if (due.length < PAGE) return expired;
  }
}
