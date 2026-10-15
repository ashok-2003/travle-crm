// Onboarding (spec 7.1), in one platform transaction: the organization's row and its subscription as the platform
// role; its starter roles, business profile and first Owner (invited by email) inside it, as the runtime role. Any
// step failing leaves nothing behind.
import type {
  OnboardedOrganization,
  OnboardOrganizationInput,
  ResendInviteInput,
} from "@travel-crm/contracts/platform";
import { asOrganization } from "@travel-crm/db/platform";
import { recordAudit } from "../audit/index.js";
import { createOrganizationRecord, insertStarterRoles, inviteOwner, requestInvite } from "../identity/index.js";
import { platformActor } from "../kernel/index.js";
import { saveOrganizationProfile } from "../profile/index.js";
import { startSubscription } from "../subscriptions/index.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** Long enough for onboarding's dozen statements on a slow day; Prisma's default is 5 seconds. */
const ONBOARDING_TIMEOUT_MS = 20_000;

export async function onboardOrganization(
  services: PlatformServices,
  staff: { userId: string },
  input: OnboardOrganizationInput,
): Promise<OnboardedOrganization> {
  return services.platformDb.transaction(
    async (tx) => {
      const organization = await createOrganizationRecord(tx, {
        name: input.name,
        code: input.code,
        timeZone: input.timeZone,
        contactEmail: input.contactEmail,
      });
      const actor = platformActor(organization.id, staff.userId);
      const owner = await asOrganization(tx, organization.id, async (orgTx) => {
        await insertStarterRoles(orgTx);
        await saveOrganizationProfile(orgTx, actor, {
          ...input.profile,
          address: null,
          bankAccountName: null,
          bankAccountNumber: null,
          bankIfsc: null,
          bankName: null,
          invoicePrefix: null,
          brandColour: null,
          documentTerms: null,
        });
        const invited = await inviteOwner(orgTx, actor, input.owner);
        await recordAudit(orgTx, actor, {
          action: "organization.onboarded",
          entityType: "organization",
          entityId: organization.id,
          after: { code: organization.code },
        });
        return invited;
      });
      // A subscription is written only by the platform role, so it comes after the step back out.
      await startSubscription(tx, staff, { organizationId: organization.id, ...input.subscription });
      await recordPlatformAudit(tx, staff, {
        action: "organization.onboarded",
        targetType: "organization",
        targetId: organization.id,
        targetOrganizationId: organization.id,
        after: { code: organization.code, planId: input.subscription.planId },
      });
      return { organizationId: organization.id, code: organization.code, ownerMemberId: owner.memberId };
    },
    { timeout: ONBOARDING_TIMEOUT_MS },
  );
}

/** Sends a member a new invite link, when the first lapsed or went astray. */
export async function resendInvite(
  services: PlatformServices,
  staff: { userId: string },
  input: ResendInviteInput,
): Promise<void> {
  await services.platformDb.transaction((tx) =>
    asOrganization(tx, input.organizationId, (orgTx) =>
      requestInvite(orgTx, platformActor(input.organizationId, staff.userId), input.memberId),
    ),
  );
}
