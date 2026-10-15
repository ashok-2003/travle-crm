// An organization's business profile (spec 7.1): saved at onboarding by the platform, inside the new organization, and
// later by its Owner; the setup checklist reads it. One row per organization, under row-level security.
import type {
  OrganizationProfileDetails,
  SaveBrandingInput,
  SaveOrganizationProfileInput,
  UpdateOrganizationProfileInput,
} from "@travel-crm/contracts/profile";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { DomainError, type Actor } from "../kernel/index.js";

/**
 * The organization's profile, or null before onboarding saved one. Named, not left to row-level security: the
 * platform's own transaction sees every organization's profile, bank account included.
 */
export async function getOrganizationProfile(
  tx: OrgTx,
  organizationId: string,
): Promise<OrganizationProfileDetails | null> {
  const row = await tx.organizationProfile.findUnique({ where: { organizationId } });
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
  return write(tx, actor, input, Object.keys(input) as ProfileField[]);
}

/** Saves the business details and keeps the branding as it was. */
export async function updateOrganizationProfile(
  tx: OrgTx,
  actor: Actor,
  input: UpdateOrganizationProfileInput,
): Promise<OrganizationProfileDetails> {
  await lockProfile(tx, actor);
  const before = await getOrganizationProfile(tx, actor.organizationId);
  const branding = { brandColour: before?.brandColour ?? null, documentTerms: before?.documentTerms ?? null };
  return write(tx, actor, { ...input, ...branding }, Object.keys(input) as ProfileField[]);
}

/** Saves the branding and keeps the business details as they were. They must exist: the colour hangs on a profile. */
export async function saveOrganizationBranding(
  tx: OrgTx,
  actor: Actor,
  input: SaveBrandingInput,
): Promise<OrganizationProfileDetails> {
  await lockProfile(tx, actor);
  const before = await getOrganizationProfile(tx, actor.organizationId);
  if (!before) {
    throw new DomainError("CONFLICT", "PROFILE_NOT_SAVED", "Save the business details before the branding");
  }
  return write(tx, actor, { ...before, ...input }, Object.keys(input) as ProfileField[]);
}

type ProfileValues = Omit<OrganizationProfileDetails, "updatedAt">;
type ProfileField = keyof ProfileValues;

/**
 * Two saves at once (a double click, two tabs) take turns: each reads the profile the other left, so the audit log
 * names what each really changed, and a first save is recorded once. Held until the transaction ends.
 */
async function lockProfile(tx: OrgTx, actor: Actor): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`organization_profile:${actor.organizationId}`}, 0))`;
}

/** Writes the whole row, and records the `touched` fields that differ from what was there. */
async function write(
  tx: OrgTx,
  actor: Actor,
  input: ProfileValues,
  touched: ProfileField[],
): Promise<OrganizationProfileDetails> {
  await lockProfile(tx, actor);
  const before = await getOrganizationProfile(tx, actor.organizationId);
  const changed = touched.filter((field) => before?.[field] !== input[field]);
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
  const saved = await getOrganizationProfile(tx, actor.organizationId);
  if (!saved) throw new Error("The profile was saved but can't be read back");
  return saved;
}
