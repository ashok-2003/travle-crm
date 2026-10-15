// One organization as the console shows and corrects it (spec 7.1): its row, its business profile, its subscription.
import type { OrganizationDetails, OrganizationRecord, UpdateOrganizationInput } from "@travel-crm/contracts/platform";
import type { SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { recordAudit } from "../audit/index.js";
import {
  findOrganizationRecord,
  updateOrganizationRecord,
  type OrganizationRecord as StoredRecord,
} from "../identity/index.js";
import { DomainError, platformActor } from "../kernel/index.js";
import { getOrganizationProfile } from "../profile/index.js";
import { getSubscription, listPayments } from "../subscriptions/index.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** The subscription with its payments, or null for an organization without one. */
async function subscriptionOf(tx: PlatformTx, organizationId: string): Promise<SubscriptionWithPayments | null> {
  try {
    return {
      subscription: await getSubscription(tx, organizationId),
      payments: await listPayments(tx, organizationId),
    };
  } catch (error) {
    if (error instanceof DomainError && error.reason === "SUBSCRIPTION_NOT_FOUND") return null;
    throw error;
  }
}

function recordOf(stored: StoredRecord): OrganizationRecord {
  return { ...stored, createdAt: stored.createdAt.toISOString() };
}

/**
 * A bank account number as the console shows it: its last four digits. Inside the organization only staff with
 * settings:manage see the whole number, and platform staff of either level have no need to.
 */
function lastFourDigits(accountNumber: string | null): string | null {
  return accountNumber === null ? null : `XXXX${accountNumber.slice(-4)}`;
}

export async function getOrganization(
  services: PlatformServices,
  organizationId: string,
): Promise<OrganizationDetails> {
  return services.platformDb.transaction(async (tx) => {
    const organization = recordOf(await findOrganizationRecord(tx, organizationId));
    const profile = await asOrganization(tx, organizationId, (orgTx) => getOrganizationProfile(orgTx, organizationId));
    return {
      organization,
      profile: profile && { ...profile, bankAccountNumber: lastFourDigits(profile.bankAccountNumber) },
      subscription: await subscriptionOf(tx, organizationId),
    };
  });
}

/** Corrects the organization's name, time zone or contact email, in its own log and the platform's. */
export async function updateOrganization(
  services: PlatformServices,
  staff: { userId: string },
  input: UpdateOrganizationInput,
): Promise<OrganizationRecord> {
  return services.platformDb.transaction(async (tx) => {
    const { before, after } = await updateOrganizationRecord(tx, input);
    const withoutName = (record: StoredRecord) => ({
      timeZone: record.timeZone,
      contactEmail: record.contactEmail !== null,
    });
    // The row is the platform role's to change; the entry goes in as the organization, under row-level security.
    await asOrganization(tx, input.organizationId, (orgTx) =>
      recordAudit(orgTx, platformActor(input.organizationId, staff.userId), {
        action: "organization.updated",
        entityType: "organization",
        entityId: input.organizationId,
        before: { name: before.name, ...withoutName(before) },
        after: { name: after.name, ...withoutName(after) },
      }),
    );
    // The platform log outlives a purge, and a sole proprietor's agency is often named after its owner: only whether
    // the name changed, as for the contact email.
    await recordPlatformAudit(tx, staff, {
      action: "organization.updated",
      targetType: "organization",
      targetId: input.organizationId,
      targetOrganizationId: input.organizationId,
      before: withoutName(before),
      after: { nameChanged: before.name !== after.name, ...withoutName(after) },
    });
    return recordOf(after);
  });
}
