// Organizations as the console makes and shows them (spec 7.1): onboarding's input in one go, and what the console
// shows of one organization.
import { z } from "zod";
import { emailAddress, organizationCode, personName, recordId } from "../identity/index.js";
import { gstStateCode, gstin, phoneNumber, timeZoneName } from "../kernel/index.js";
import { organizationProfileDetails } from "../profile/index.js";
import { startSubscriptionInput, subscriptionWithPayments } from "../subscriptions/index.js";

/** What the platform team enters to onboard an agency (spec 7.1), and its first Owner, who is invited by email. */
export const onboardOrganizationInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  code: organizationCode,
  timeZone: timeZoneName.default("Asia/Kolkata"),
  /** Where replies to the organization's email go. */
  contactEmail: emailAddress,
  profile: z
    .strictObject({
      legalName: z.string().trim().min(1).max(120),
      gstin: gstin.nullable(),
      gstStateCode,
      contactName: personName.nullable(),
      contactPhone: phoneNumber.nullable(),
    })
    .refine((profile) => profile.gstin === null || profile.gstin.startsWith(profile.gstStateCode), {
      message: "The GSTIN belongs to another state",
      path: ["gstin"],
    }),
  owner: z.strictObject({ name: personName, email: emailAddress }),
  subscription: startSubscriptionInput,
});
export type OnboardOrganizationInput = z.infer<typeof onboardOrganizationInput>;

export const onboardedOrganization = z.object({
  organizationId: recordId,
  code: z.string(),
  ownerMemberId: recordId,
});
export type OnboardedOrganization = z.infer<typeof onboardedOrganization>;

/** The organization's own row: what the platform may correct. The code never changes: usernames contain it. */
export const updateOrganizationInput = z.strictObject({
  organizationId: recordId,
  name: z.string().trim().min(1).max(120),
  timeZone: timeZoneName,
  contactEmail: emailAddress.nullable(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationInput>;

export const resendInviteInput = z.strictObject({ organizationId: recordId, memberId: recordId });
export type ResendInviteInput = z.infer<typeof resendInviteInput>;

export const organizationRecord = z.object({
  id: recordId,
  name: z.string(),
  code: z.string(),
  timeZone: z.string(),
  contactEmail: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type OrganizationRecord = z.infer<typeof organizationRecord>;

/** One organization as the console shows it. */
export const organizationDetails = z.object({
  organization: organizationRecord,
  profile: organizationProfileDetails.nullable(),
  /** Null for an organization without a subscription, which onboarding never makes. */
  subscription: subscriptionWithPayments.nullable(),
});
export type OrganizationDetails = z.infer<typeof organizationDetails>;
