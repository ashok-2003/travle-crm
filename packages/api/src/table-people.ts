// The people a table names (bookings revamp, 2026-11-27): each row's salesperson (the lead's owner) by name, from
// identity's memberContacts (R13), and the salespeople its filter offers. A member who sees only their own records gets
// no salespeople: their filter is ignored anyway.
import type { LeadWorker } from "@travel-crm/contracts/crm";
import type { Identity, MemberAccess } from "@travel-crm/domain/identity";
import { memberNames } from "./member-names.js";

/** The rows with their owner's name in place of the id: null for nobody, or for a former member. */
export async function withOwnerNames<Row extends { ownerUserId: string | null }>(
  identity: Identity,
  organizationId: string,
  rows: readonly Row[],
): Promise<(Omit<Row, "ownerUserId"> & { ownerName: string | null })[]> {
  const names = await memberNames(
    identity,
    organizationId,
    rows.map((row) => row.ownerUserId),
  );
  return rows.map(({ ownerUserId, ...row }) => ({
    ...row,
    ownerName: ownerUserId === null ? null : (names[ownerUserId] ?? null),
  }));
}

/** The agency's lead workers by id and name, for a member who sees every record the permission covers; else none. */
export async function salespeopleFor(
  identity: Identity,
  member: MemberAccess,
  permission: "bookings:view" | "quotes:view",
): Promise<LeadWorker[]> {
  if (member.permissions.scopeOf(permission) !== "all") return [];
  return identity.leadWorkers(member.organizationId);
}
