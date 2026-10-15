// The organization's own row (spec 7.1) for the platform console: read for its directory, and corrected by platform
// staff. Its code never changes once there are staff: usernames contain it. The platform role only.
import type { IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";

export interface OrganizationRecord {
  id: string;
  name: string;
  code: string;
  timeZone: string;
  contactEmail: string | null;
  createdAt: Date;
}

const recordFields = { id: true, name: true, code: true, timeZone: true, contactEmail: true, createdAt: true } as const;

/** Every organization, oldest first. */
export async function listOrganizationRecords(tx: IdentityTx): Promise<OrganizationRecord[]> {
  return tx.organization.findMany({ select: recordFields, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

export async function findOrganizationRecord(tx: IdentityTx, organizationId: string): Promise<OrganizationRecord> {
  const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: recordFields });
  if (!organization) throw new DomainError("NOT_FOUND", "ORGANIZATION_NOT_FOUND", "No such organization");
  return organization;
}

/**
 * Holds the organization's row until the transaction ends, for its purge: FOR UPDATE, which conflicts with the KEY
 * SHARE lock that writing a row keyed to the organization takes, so a row written into any of its tables meanwhile
 * waits for the purge, then finds the organization gone. Taken after the subscription's lock, the order every holder
 * keeps. The platform role only.
 */
export async function holdOrganizationRecord(tx: IdentityTx, organizationId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM organization WHERE id = ${organizationId}::uuid FOR UPDATE`;
}

/** The organization with this sign-in code, or null when there is none. */
export async function findOrganizationByCode(tx: IdentityTx, code: string): Promise<OrganizationRecord | null> {
  return tx.organization.findUnique({ where: { code }, select: recordFields });
}

/** Corrects the name, time zone and contact email. Returns the row before and after. */
export async function updateOrganizationRecord(
  tx: IdentityTx,
  change: { organizationId: string; name: string; timeZone: string; contactEmail: string | null },
): Promise<{ before: OrganizationRecord; after: OrganizationRecord }> {
  const before = await findOrganizationRecord(tx, change.organizationId);
  const after = await tx.organization.update({
    where: { id: change.organizationId },
    data: { name: change.name, timeZone: change.timeZone, contactEmail: change.contactEmail },
    select: recordFields,
  });
  return { before, after };
}
