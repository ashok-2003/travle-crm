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

export async function getOrganization(
  services: PlatformServices,
  organizationId: string,
): Promise<OrganizationDetails> {
  return services.platformDb.transaction(async (tx) => {
    const organization = recordOf(await findOrganizationRecord(tx, organizationId));
    const profile = await asOrganization(tx, organizationId, getOrganizationProfile);
    return { organization, profile, subscription: await subscriptionOf(tx, organizationId) };
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
    const change = {
      before: { name: before.name, timeZone: before.timeZone, contactEmail: before.contactEmail !== null },
      after: { name: after.name, timeZone: after.timeZone, contactEmail: after.contactEmail !== null },
    };
    await recordAudit(tx, platformActor(input.organizationId, staff.userId), {
      action: "organization.updated",
      entityType: "organization",
      entityId: input.organizationId,
      ...change,
    });
    await recordPlatformAudit(tx, staff, {
      action: "organization.updated",
      targetType: "organization",
      targetId: input.organizationId,
      targetOrganizationId: input.organizationId,
      ...change,
    });
    return recordOf(after);
  });
}
