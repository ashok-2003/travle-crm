// A file's Owner and Role values matched to the agency's people and roles (spec B11), for the imports module: values
// go in and user ids or role keys come out, so names, usernames and emails never leave identity. A value is compared
// trimmed, in lower case, with its spaces collapsed; one that matches nothing, or more than one person, is absent.
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { notBanned, roleKeys } from "./lead-workers.js";
import { isPlaceholderEmail } from "./sign-in-names.js";

export interface LeadWorkerMatch {
  userId: string;
  matchedBy: "name" | "username" | "email" | "first_name";
}

export interface RoleMatch {
  roleKey: string;
  matchedBy: "name" | "word";
}

const comparable = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

/** Each way of naming a person, to the user ids it names. */
function indexBy<Item>(
  items: readonly Item[],
  keysOf: (item: Item) => (string | null)[],
  idOf: (item: Item) => string,
) {
  const index = new Map<string, Set<string>>();
  for (const item of items) {
    for (const key of keysOf(item)) {
      if (key === null || key === "") continue;
      const ids = index.get(key) ?? new Set<string>();
      ids.add(idOf(item));
      index.set(key, ids);
    }
  }
  return index;
}

/** The one id the index gives for the value, or null when it gives none or several. */
function onlyOne(index: ReadonlyMap<string, ReadonlySet<string>>, value: string): string | null {
  const ids = index.get(value);
  return ids?.size === 1 ? ([...ids][0] ?? null) : null;
}

/**
 * The lead workers (R14: active, not banned, on a role that sees leads) the values name: by full name, username or
 * email, or by a first name alone when only one of them has it.
 */
export async function matchLeadWorkers(
  database: IdentityDatabase,
  organizationId: string,
  values: readonly string[],
): Promise<Map<string, LeadWorkerMatch>> {
  const workers = await database.forOrg(organizationId, async (tx) => {
    const { leads } = await roleKeys(tx, organizationId);
    // The member table has no row-level security, so the organization is filtered here; soft delete hides removals.
    return tx.member.findMany({
      where: { organizationId, role: { in: [...leads] }, ...notBanned() },
      select: { userId: true, user: { select: { name: true, displayUsername: true, email: true } } },
    });
  });
  const idOf = (worker: (typeof workers)[number]) => worker.userId;
  const ways = [
    ["name", indexBy(workers, (worker) => [comparable(worker.user.name)], idOf)],
    [
      "username",
      indexBy(workers, (worker) => [worker.user.displayUsername && comparable(worker.user.displayUsername)], idOf),
    ],
    [
      "email",
      indexBy(
        workers,
        (worker) => [isPlaceholderEmail(worker.user.email) ? null : comparable(worker.user.email)],
        idOf,
      ),
    ],
    ["first_name", indexBy(workers, (worker) => [comparable(worker.user.name).split(" ")[0] ?? null], idOf)],
  ] as const;
  const matches = new Map<string, LeadWorkerMatch>();
  for (const value of values) {
    for (const [matchedBy, index] of ways) {
      const userId = onlyOne(index, comparable(value));
      if (userId !== null) {
        matches.set(value, { userId, matchedBy });
        break;
      }
    }
  }
  return matches;
}

/** The agency's roles the values name: by the role's name, or by its key (a word such as "org-admin"). */
export async function matchRoles(
  database: IdentityDatabase,
  organizationId: string,
  values: readonly string[],
): Promise<Map<string, RoleMatch>> {
  const roles = await database.forOrg(organizationId, (tx) =>
    tx.role.findMany({ where: { organizationId }, select: { key: true, name: true } }),
  );
  const byName = indexBy(
    roles,
    (role) => [comparable(role.name)],
    (role) => role.key,
  );
  const byKey = indexBy(
    roles,
    (role) => [role.key],
    (role) => role.key,
  );
  const matches = new Map<string, RoleMatch>();
  for (const value of values) {
    const named = onlyOne(byName, comparable(value));
    const keyed = onlyOne(byKey, comparable(value));
    if (named !== null) matches.set(value, { roleKey: named, matchedBy: "name" });
    else if (keyed !== null) matches.set(value, { roleKey: keyed, matchedBy: "word" });
  }
  return matches;
}
