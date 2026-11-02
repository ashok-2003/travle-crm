// The platform dashboard (spec 7.4): every organization with its status, days left, seats used, last activity and this
// month's usage, a page at a time. The page, its activity, subscriptions and policy are read set-based in one platform
// transaction. What the modules count (stored bytes, changes, documents) must run as the runtime role under row-level
// security, so each organization steps into its own short transaction, a pool's worth at a time.
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
import { entitlementsFrom, getSubscriptionPolicy, type SubscriptionFacts } from "../subscriptions/index.js";
import type { PlatformServices } from "./services.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The console's connection pool: how many organizations are counted at once. */
const COUNT_CONCURRENCY = 3;

/** Maps items with at most `limit` calls in flight, keeping the order of the items. */
async function mapConcurrently<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await work(item);
    }
  });
  await Promise.all(lanes);
  return results;
}

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
  const { organizations, more, activity, facts } = await services.platformDb.transaction(async (tx) => {
    // One more than the page, to know whether another page follows.
    const found = await listOrganizationRecords(tx, { limit: input.limit + 1, after: input.after });
    const page = found.slice(0, input.limit);
    const ids = page.map((organization) => organization.id);
    const people = await memberActivity(tx, ids);
    // The platform role reads every organization's subscription at once; the policy is one row for all of them.
    const subscriptions =
      ids.length === 0
        ? []
        : await tx.subscription.findMany({
            where: { organizationId: { in: ids } },
            include: { plan: true },
          });
    const policy = await getSubscriptionPolicy(tx);
    const zones = new Map(page.map((organization) => [organization.id, organization.timeZone]));
    const loaded = new Map<string, SubscriptionFacts>();
    for (const row of subscriptions) {
      const timeZone = zones.get(row.organizationId);
      if (timeZone !== undefined) loaded.set(row.organizationId, { row, timeZone, policy });
    }
    return {
      organizations: page,
      more: found.length > input.limit,
      activity: new Map(people.map((row) => [row.organizationId, row])),
      facts: loaded,
    };
  });
  const counts = await mapConcurrently(organizations, COUNT_CONCURRENCY, (organization) => {
    const today = calendarDateIn(now, organization.timeZone);
    const monthStart = startOfDayIn(parseCalendarDate(`${today.slice(0, 7)}-01`), organization.timeZone);
    // A short transaction for each organization's few counts, rather than one that grows with every organization.
    return services.platformDb.transaction((tx) =>
      asOrganization(tx, organization.id, async (orgTx) => ({
        storedBytes: await bytesStored(orgTx, organization.id),
        changes: await auditEntriesSince(orgTx, monthStart),
        documentsIssued: await documentsIssuedSince(orgTx, monthStart),
      })),
    );
  });
  const overviews: OrganizationOverview[] = [];
  for (const [index, organization] of organizations.entries()) {
    const today = calendarDateIn(now, organization.timeZone);
    const counted = counts[index];
    if (counted === undefined) throw new Error("A count is missing for an organization on the page");
    const stored = facts.get(organization.id);
    const entitlements = stored ? entitlementsFrom(stored, now) : null;
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
