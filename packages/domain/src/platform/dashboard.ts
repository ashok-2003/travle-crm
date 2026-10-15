// The platform dashboard (spec 7.4): every organization with its status, days left, seats used, last activity and this
// month's usage, a page at a time. The page's list in one platform transaction, then one for each organization,
// stepping into it for what its modules count.
import type {
  ListOrganizationsOverviewInput,
  OrganizationOverview,
  OrganizationsOverviewPage,
} from "@travel-crm/contracts/platform";
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

/** A page of the dashboard, oldest organization first; the next page starts after its last organization. */
export async function organizationsOverview(
  services: PlatformServices,
  input: ListOrganizationsOverviewInput,
  now: Date = new Date(),
): Promise<OrganizationsOverviewPage> {
  const { organizations, more, activity } = await services.platformDb.transaction(async (tx) => {
    // One more than the page, to know whether another page follows.
    const found = await listOrganizationRecords(tx, { limit: input.limit + 1, after: input.after });
    const page = found.slice(0, input.limit);
    const people = await memberActivity(
      tx,
      page.map((organization) => organization.id),
    );
    return {
      organizations: page,
      more: found.length > input.limit,
      activity: new Map(people.map((row) => [row.organizationId, row])),
    };
  });
  const overviews: OrganizationOverview[] = [];
  // A short transaction for each organization's few counts, rather than one that grows with every organization.
  for (const organization of organizations) {
    const today = calendarDateIn(now, organization.timeZone);
    const monthStart = startOfDayIn(parseCalendarDate(`${today.slice(0, 7)}-01`), organization.timeZone);
    const counted = await services.platformDb.transaction((tx) =>
      asOrganization(tx, organization.id, async (orgTx) => ({
        entitlements: await entitlementsOf(orgTx, organization.id, now),
        storedBytes: await bytesStored(orgTx, organization.id),
        changes: await auditEntriesSince(orgTx, monthStart),
        documentsIssued: await documentsIssuedSince(orgTx, monthStart),
      })),
    );
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
  return { organizations: overviews, nextCursor: more ? (organizations.at(-1)?.id ?? null) : null };
}
