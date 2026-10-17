// Names for the people a page mentions (R13): pages carry user ids, and their routers add the names from identity's
// memberContacts, never from the sign-in tables. An id left out is a former member, whom the screens name as such.
import type { Identity } from "@travel-crm/domain/identity";

/** Each active member among these user ids, named once; nobody (null) and former members are left out. */
export async function memberNames(
  identity: Identity,
  organizationId: string,
  userIds: Iterable<string | null | undefined>,
): Promise<Record<string, string>> {
  const ids = [...new Set([...userIds].filter((userId): userId is string => typeof userId === "string"))];
  if (ids.length === 0) return {};
  const members = await identity.memberContacts(organizationId, ids);
  return Object.fromEntries(members.map((member) => [member.userId, member.name]));
}
