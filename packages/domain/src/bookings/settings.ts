// How an agency's bookings run (release 6): the payment schedule offered at Confirm, when travellers' details lock, the
// reminders and their WhatsApp templates, the packing list, the emergency contact, the bank details, the cancellation steps
// and notes, and the review link. Saved by whoever manages settings, each template checked to be one of the agency's
// approved ones with a value for every blank; audited. The cancellation policy of the day is copied onto each booking.
import { markersOf } from "@travel-crm/contracts/inbox";
import {
  bookingSettingsView,
  type BookingSettingsView,
  type Policy,
  type PolicyRule,
  type SaveBookingSettingsInput,
} from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

const columns = {
  advanceBasisPoints: true,
  balanceDaysBefore: true,
  detailsCutoffDays: true,
  defaultLevel: true,
  balanceReminderDays: true,
  detailsReminderDays: true,
  balanceTemplateId: true,
  balanceParams: true,
  detailsTemplateId: true,
  detailsParams: true,
  reportingTemplateId: true,
  reportingParams: true,
  feedbackTemplateId: true,
  feedbackParams: true,
  packingList: true,
  emergencyName: true,
  emergencyPhone: true,
  bankDetails: true,
  cancellationNotes: true,
  googleReviewUrl: true,
} as const;

/** What an agency that never set the policy cancels by: 30 days or more 10 %, 15 to 29 days 25 %, nearer 100 %. */
export const defaultPolicyRules: readonly PolicyRule[] = [
  { daysBeforeMin: 0, chargeBasisPoints: 10_000 },
  { daysBeforeMin: 15, chargeBasisPoints: 2_500 },
  { daysBeforeMin: 30, chargeBasisPoints: 1_000 },
];

export const defaultBookingSettings: Omit<BookingSettingsView, "rules"> = {
  advanceBasisPoints: 3_000,
  balanceDaysBefore: 15,
  detailsCutoffDays: 3,
  defaultLevel: "basic",
  balanceReminderDays: [3, 0],
  detailsReminderDays: 10,
  balanceTemplateId: null,
  balanceParams: [],
  detailsTemplateId: null,
  detailsParams: [],
  reportingTemplateId: null,
  reportingParams: [],
  feedbackTemplateId: null,
  feedbackParams: [],
  packingList: "",
  emergencyName: "",
  emergencyPhone: "",
  bankDetails: "",
  cancellationNotes: "",
  googleReviewUrl: "",
};

/** The agency's cancellation steps, nearest departure first; the default steps when it set none. */
export async function policyRulesOf(tx: OrgTx): Promise<PolicyRule[]> {
  const rows = await tx.cancellationPolicyRule.findMany({
    orderBy: { daysBeforeMin: "asc" },
    select: { daysBeforeMin: true, chargeBasisPoints: true },
  });
  return rows.length === 0 ? [...defaultPolicyRules] : rows;
}

/** The policy as a booking freezes it at the start: the steps and the notes of the day. */
export async function currentPolicy(tx: OrgTx): Promise<Policy> {
  const settings = await bookingSettingsOf(tx);
  return { rules: settings.rules, notes: settings.cancellationNotes };
}

export async function bookingSettingsOf(tx: OrgTx): Promise<BookingSettingsView> {
  const row = await tx.bookingSettings.findFirst({ select: columns });
  return bookingSettingsView.parse({ ...(row ?? defaultBookingSettings), rules: await policyRulesOf(tx) });
}

/** The template must be the agency's, approved, and every blank given something. */
async function assertTemplate(tx: OrgTx, templateId: string | null, params: readonly string[]) {
  if (templateId === null) return;
  const template = await tx.whatsappTemplate.findUnique({
    where: { id: templateId },
    select: { status: true, body: true },
  });
  if (template?.status !== "approved") {
    throw new DomainError("CONFLICT", "TEMPLATE_NOT_APPROVED", "Only an approved template can be sent");
  }
  if (markersOf(template.body).length !== params.length) {
    throw new DomainError("VALIDATION", "TEMPLATE_VALUES", "Give a value for each blank in the template");
  }
}

export async function saveBookingSettings(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveBookingSettingsInput,
): Promise<BookingSettingsView> {
  await assertTemplate(tx, input.balanceTemplateId, input.balanceParams);
  await assertTemplate(tx, input.detailsTemplateId, input.detailsParams);
  await assertTemplate(tx, input.reportingTemplateId, input.reportingParams);
  await assertTemplate(tx, input.feedbackTemplateId, input.feedbackParams);
  const before = await bookingSettingsOf(tx);
  const { rules, ...settings } = input;
  const data = {
    ...settings,
    balanceReminderDays: [...new Set(settings.balanceReminderDays)],
    updatedBy: access.userId,
  };
  const existing = await tx.bookingSettings.findFirst({ select: { organizationId: true } });
  if (existing === null) await tx.bookingSettings.create({ data });
  else await tx.bookingSettings.update({ where: { organizationId: existing.organizationId }, data });
  // The steps are replaced as a whole; the unique day keeps two steps from starting on the same day.
  await tx.cancellationPolicyRule.deleteMany({});
  await tx.cancellationPolicyRule.createMany({ data: rules.map((rule) => ({ ...rule })) });
  await recordAudit(tx, access, {
    action: "booking-settings.changed",
    entityType: "booking_settings",
    entityId: access.organizationId,
    before: { advanceBasisPoints: before.advanceBasisPoints, steps: before.rules.length },
    after: { advanceBasisPoints: input.advanceBasisPoints, steps: rules.length },
  });
  return bookingSettingsOf(tx);
}
