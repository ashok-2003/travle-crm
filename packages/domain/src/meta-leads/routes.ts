// The one reader of the table outside row-level security (ADR 0034): meta_page_route, which lets the webhook find a Page's
// agency, the worker the Pages whose catch-up is due, and the deletion callback the Pages a Meta user connected, each
// without entering an organization, and keeps a Page to one agency at a time (M4). It holds ids and times only and is
// reached in db.withoutOrg(). The ESLint raw-SQL guard allows its name in this file alone.
import { type Database, isUniqueViolation } from "@travel-crm/db";
import { metaRoutes } from "@travel-crm/db/meta-routes";

/** The agency holding a Meta Page, or null when nobody does. */
export async function routeOfMetaPage(
  db: Database,
  metaPageId: string,
): Promise<{ organizationId: string; metaUserId: string } | null> {
  return db.withoutOrg((tx) =>
    metaRoutes(tx).findUnique({ where: { pageId: metaPageId }, select: { organizationId: true, metaUserId: true } }),
  );
}

/** Whether another agency than this one holds the Page (M4): a refusal that says only "already connected elsewhere". */
export async function isHeldElsewhere(db: Database, organizationId: string, metaPageId: string): Promise<boolean> {
  const held = await routeOfMetaPage(db, metaPageId);
  return held !== null && held.organizationId !== organizationId;
}

export interface RouteInput {
  metaPageId: string;
  organizationId: string;
  metaUserId: string;
  /** When the Page's first catch-up is due, if it has no row yet. */
  nextCatchupAt: Date;
}

/**
 * The Page's route: made when it has none, and kept as it is (its due time too) when it has. "taken" when another agency
 * holds the Page (a lost race of two connects, M4).
 */
export async function upsertRoute(db: Database, input: RouteInput): Promise<"ok" | "taken"> {
  try {
    return await db.withoutOrg(async (tx) => {
      const held = await metaRoutes(tx).findUnique({
        where: { pageId: input.metaPageId },
        select: { organizationId: true },
      });
      if (held !== null && held.organizationId !== input.organizationId) return "taken";
      await metaRoutes(tx).upsert({
        where: { pageId: input.metaPageId },
        create: {
          pageId: input.metaPageId,
          organizationId: input.organizationId,
          metaUserId: input.metaUserId,
          nextCatchupAt: input.nextCatchupAt,
        },
        update: { metaUserId: input.metaUserId },
      });
      return "ok";
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "taken";
    throw error;
  }
}

/** Removes the agency's route to the Page; nothing when it has none, and never another agency's. */
export async function removeRoute(db: Database, organizationId: string, metaPageId: string): Promise<void> {
  // The organization is named as well as the page: the route has no row-level security to hold another agency's row off.
  await db.withoutOrg((tx) => metaRoutes(tx).deleteMany({ where: { pageId: metaPageId, organizationId } }));
}

/** The Pages a Meta user connected, across all agencies, for the deletion callback. */
export async function routesOfMetaUser(
  db: Database,
  metaUserId: string,
): Promise<{ organizationId: string; metaPageId: string }[]> {
  const rows = await db.withoutOrg((tx) =>
    metaRoutes(tx).findMany({ where: { metaUserId }, select: { organizationId: true, pageId: true } }),
  );
  return rows.map((row) => ({ organizationId: row.organizationId, metaPageId: row.pageId }));
}

/** The route row of a Page, for a test or a check of the exemption. */
export function routeRowOf(db: Database, metaPageId: string) {
  return db.withoutOrg((tx) => metaRoutes(tx).findUnique({ where: { pageId: metaPageId } }));
}

/** How many routes there are, for a test. */
export function routeCount(db: Database): Promise<number> {
  return db.withoutOrg((tx) => metaRoutes(tx).count());
}

/**
 * The most overdue Pages that are due and not claimed (SKIP LOCKED, so two dispatchers get disjoint sets), at most `limit`,
 * each held for `claimSeconds` so a Page already queued is not queued again.
 */
export async function claimDueCatchups(
  db: Database,
  input: { now: Date; limit: number; claimSeconds: number },
): Promise<{ metaPageId: string; organizationId: string }[]> {
  const until = new Date(input.now.getTime() + input.claimSeconds * 1000);
  return db.withoutOrg(async (tx) => {
    const due = await tx.$queryRaw<{ id: string; pageId: string; organizationId: string }[]>`
      SELECT id, page_id AS "pageId", organization_id AS "organizationId"
      FROM meta_page_route
      WHERE next_catchup_at <= ${input.now}
        AND (claimed_until IS NULL OR claimed_until < ${input.now})
      ORDER BY next_catchup_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${input.limit}`;
    if (due.length > 0) {
      await tx.$executeRaw`
        UPDATE meta_page_route SET claimed_until = ${until} WHERE id = ANY(${due.map((row) => row.id)}::uuid[])`;
    }
    return due.map((row) => ({ metaPageId: row.pageId, organizationId: row.organizationId }));
  });
}

/** A catch-up's end: the next time it is due and its claim released, or, with null, the route removed. */
export async function finishCatchup(
  db: Database,
  input: { metaPageId: string; organizationId: string; nextCatchupAt: Date | null },
): Promise<void> {
  if (input.nextCatchupAt === null) return removeRoute(db, input.organizationId, input.metaPageId);
  const { nextCatchupAt } = input;
  await db.withoutOrg((tx) =>
    metaRoutes(tx).updateMany({
      where: { pageId: input.metaPageId, organizationId: input.organizationId },
      data: { nextCatchupAt, claimedUntil: null },
    }),
  );
}

/** Makes a Page's catch-up due now, for Check now and for a Page that was resumed or reconnected. */
export async function makeCatchupDue(
  db: Database,
  input: { metaPageId: string; organizationId: string; now: Date },
): Promise<void> {
  await db.withoutOrg((tx) =>
    metaRoutes(tx).updateMany({
      where: { pageId: input.metaPageId, organizationId: input.organizationId },
      data: { nextCatchupAt: input.now },
    }),
  );
}
