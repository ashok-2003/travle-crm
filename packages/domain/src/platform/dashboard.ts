// The platform dashboard (spec 7.4): every organization with its status, days left, seats used, last activity and this
// month's usage. One platform transaction, stepping into each organization for what its modules count.
import type { OrganizationOverview } from "@travel-crm/contracts/platform";
import { asOrganization } from "@travel-crm/db/platform";
import { auditEntriesSince } from "../audit/index.js";
import { documentsIssuedSince } from "../documents/index.js";
import { bytesStored } from "../files/index.js";
import { listOrganizationRecords, memberActivity } from "../identity/index.js";
import { calendarDateIn, parseCalendarDate, startOfDayIn } from "../kernel/index.js";
import { entitlementsOf } from "../subscriptions/index.js";
import type { PlatformServices } from "./services.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one calendar date to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export async function organizationsOverview(
  services: PlatformServices,
  now: Date = new Date(),
): Promise<OrganizationOverview[]> {
  return services.platformDb.transaction(
    async (tx) => {
      const organizations = await listOrganizationRecords(tx);
      const activity = new Map(
        (
          await memberActivity(
            tx,
            organizations.map((organization) => organization.id),
          )
        ).map((row) => [row.organizationId, row]),
      );
      const overviews: OrganizationOverview[] = [];
      for (const organization of organizations) {
        const today = calendarDateIn(now, organization.timeZone);
        const monthStart = startOfDayIn(parseCalendarDate(`${today.slice(0, 7)}-01`), organization.timeZone);
        const counted = await asOrganization(tx, organization.id, async (orgTx) => ({
          entitlements: await entitlementsOf(orgTx, organization.id, now),
          storedBytes: await bytesStored(orgTx),
          changes: await auditEntriesSince(orgTx, monthStart),
          documentsIssued: await documentsIssuedSince(orgTx, monthStart),
        }));
        const { entitlements } = counted;
        const people = activity.get(organization.id);
        overviews.push({
          organizationId: organization.id,
          name: organization.name,
          code: organization.code,
          status: entitlements?.status ?? null,
          planName: entitlements?.planName ?? null,
          nextChangeOn: entitlements?.nextChangeOn ?? null,
          daysLeft: entitlements?.nextChangeOn ? daysBetween(today, entitlements.nextChangeOn) : null,
          seats: { used: people?.seatsUsed ?? 0, limit: entitlements?.limits.seats ?? null },
          storage: { usedBytes: counted.storedBytes, limitBytes: entitlements?.limits.storageBytes ?? null },
          lastActiveAt: people?.lastActiveAt ?? null,
          thisMonth: { changes: counted.changes, documentsIssued: counted.documentsIssued },
        });
      }
      return overviews;
    },
    // A few small queries per organization.
    { timeout: 60_000 },
  );
}
