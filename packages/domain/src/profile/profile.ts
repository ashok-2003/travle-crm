// An organization's business profile (spec 7.1): saved at onboarding by the platform, inside the new organization, and
// later by its Owner; the setup checklist reads it. One row per organization, under row-level security.
import type { OrganizationProfileDetails, SaveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Actor } from "../kernel/index.js";

/** The transaction's organization's profile, or null before onboarding saved one. */
export async function getOrganizationProfile(tx: OrgTx): Promise<OrganizationProfileDetails | null> {
  const row = await tx.organizationProfile.findFirst();
  if (!row) return null;
  return {
    legalName: row.legalName,
    gstin: row.gstin,
    gstStateCode: row.gstStateCode,
    address: row.address,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    bankAccountName: row.bankAccountName,
    bankAccountNumber: row.bankAccountNumber,
    bankIfsc: row.bankIfsc,
    bankName: row.bankName,
    invoicePrefix: row.invoicePrefix,
    brandColour: row.brandColour,
    documentTerms: row.documentTerms,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Saves the whole profile in the actor's organization. Recorded as "organization-profile.saved" with the names of the
 * fields that changed, not their values (bank details are for invoices, not the audit log). Saving the same values
 * again records nothing.
 */
export async function saveOrganizationProfile(
  tx: OrgTx,
  actor: Actor,
  input: SaveOrganizationProfileInput,
): Promise<OrganizationProfileDetails> {
  const before = await getOrganizationProfile(tx);
  const changed = (Object.keys(input) as (keyof SaveOrganizationProfileInput)[]).filter(
    (field) => before?.[field] !== input[field],
  );
  if (changed.length > 0) {
    await tx.organizationProfile.upsert({
      where: { organizationId: actor.organizationId },
      create: { ...input, organizationId: actor.organizationId, updatedBy: actor.userId },
      update: { ...input, updatedBy: actor.userId },
    });
    await recordAudit(tx, actor, {
      action: "organization-profile.saved",
      entityType: "organization",
      entityId: actor.organizationId,
      after: { fields: changed },
    });
  }
  const saved = await getOrganizationProfile(tx);
  if (!saved) throw new Error("The profile was saved but can't be read back");
  return saved;
}
