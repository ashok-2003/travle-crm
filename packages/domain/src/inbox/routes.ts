// The one reader of the tables outside row-level security (ADR 0035): whatsapp_number_route, which lets the webhook find an
// agency from MSG91's integrated number without entering an organization, and whatsapp_unrouted, the count of numbers MSG91
// sent events for that nobody recorded. Both hold ids, numbers and counts only and are reached in db.withoutOrg(). The ESLint
// raw-SQL guard allows their names in this file alone.
import { type Database, isUniqueViolation } from "@travel-crm/db";
import { whatsappNumberRoutes, whatsappUnrouted } from "@travel-crm/db/whatsapp-routes";

/** The agency and connection holding a number, or null when nobody does. */
export async function routeOfNumber(
  db: Database,
  integratedNumber: string,
): Promise<{ organizationId: string; connectionId: string } | null> {
  return db.withoutOrg((tx) =>
    whatsappNumberRoutes(tx).findUnique({
      where: { integratedNumber },
      select: { organizationId: true, connectionId: true },
    }),
  );
}

/** The connection's route: made when it has none, and kept when it has. "taken" when another agency holds the number. */
export async function upsertRoute(
  db: Database,
  input: { integratedNumber: string; organizationId: string; connectionId: string },
): Promise<"ok" | "taken"> {
  try {
    return await db.withoutOrg(async (tx) => {
      const held = await whatsappNumberRoutes(tx).findUnique({
        where: { integratedNumber: input.integratedNumber },
        select: { organizationId: true, connectionId: true },
      });
      if (held !== null) return held.connectionId === input.connectionId ? "ok" : "taken";
      await whatsappNumberRoutes(tx).create({ data: input });
      return "ok";
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "taken";
    throw error;
  }
}

/** Removes the agency's route for the connection; nothing when it has none, and never another agency's. */
export async function removeRoute(db: Database, organizationId: string, connectionId: string): Promise<void> {
  // The organization is named as well as the connection: the route has no row-level security to hold another agency's row off.
  await db.withoutOrg((tx) => whatsappNumberRoutes(tx).deleteMany({ where: { connectionId, organizationId } }));
}

/** One page of every route, by number, for the health check to walk. */
export async function routesPage(
  db: Database,
  input: { after?: string | undefined; limit: number },
): Promise<{ integratedNumber: string; organizationId: string; connectionId: string }[]> {
  return db.withoutOrg((tx) =>
    whatsappNumberRoutes(tx).findMany({
      where: input.after === undefined ? {} : { integratedNumber: { gt: input.after } },
      orderBy: { integratedNumber: "asc" },
      take: input.limit,
      select: { integratedNumber: true, organizationId: true, connectionId: true },
    }),
  );
}

/** How many routes there are, for a test. */
export function routeCount(db: Database): Promise<number> {
  return db.withoutOrg((tx) => whatsappNumberRoutes(tx).count());
}

/** Counts an event for a number nobody recorded: its first and last time and how many (R5). */
export async function noteUnrouted(db: Database, integratedNumber: string, now: Date): Promise<void> {
  await db.withoutOrg(async (tx) => {
    await whatsappUnrouted(tx).upsert({
      where: { integratedNumber },
      create: { integratedNumber, firstSeenAt: now, lastSeenAt: now, events: 1 },
      update: { lastSeenAt: now, events: { increment: 1 } },
    });
  });
}

/** The unrouted numbers, most recently seen first, for tests and the console's own reading. */
export function unroutedNumbers(db: Database) {
  return db.withoutOrg((tx) => whatsappUnrouted(tx).findMany({ orderBy: { lastSeenAt: "desc" }, take: 50 }));
}

/** Whether another agency than this one holds the number: a refusal that says only "already in use". */
export async function isNumberHeldElsewhere(
  db: Database,
  organizationId: string,
  integratedNumber: string,
): Promise<boolean> {
  const held = await routeOfNumber(db, integratedNumber);
  return held !== null && held.organizationId !== organizationId;
}
