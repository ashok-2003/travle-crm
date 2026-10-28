// The platform log's actions the console has a sentence for (consolePlatform.log.actions): every action the platform
// module records (packages/domain/src/platform; log-actions.test.ts reads its sources to hold this list to them).
// Another reads as recorded, in its own words, until it has one.
export const KNOWN_ACTIONS = [
  "organization.onboarded",
  "organization.updated",
  "organization.export-requested",
  "organization.exported",
  "organization.export-downloaded",
  "organization.export-expired",
  "organization.purge-requested",
  "organization.purge-skipped",
  "organization.purged",
  "subject.exported",
  "subject.erasure-requested",
  "subject.erasure-skipped",
  "subject.erased",
  "plan.created",
  "plan.updated",
  "plan.archived",
  "subscription-policy.changed",
  "subscription.plan-changed",
  "subscription.paid-through-changed",
  "subscription.payment-recorded",
  "subscription.payment-voided",
  "subscription.overrides-changed",
  "subscription.trial-end-changed",
  "subscription.suspended",
  "subscription.suspension-lifted",
  "subscription.cancelled",
  "platform-staff.added",
  "platform-staff.level-changed",
  "platform-staff.password-reset",
  "platform-staff.removed",
  "job.retried",
  "job.retry-failed",
  "schedule.removed",
  "schedule.removal-failed",
  "demo.reset",
  "invite.created",
  "invite.cancelled",
  "invite.joined",
] as const;

export type KnownAction = (typeof KNOWN_ACTIONS)[number];

export function isKnownAction(action: string): action is KnownAction {
  return (KNOWN_ACTIONS as readonly string[]).includes(action);
}

/**
 * The kinds of target the log names by a word (consolePlatform.log.targets); others show their own name. Every record
 * type an erasure may act on is one: a traveller, and crm's customer, the "person".
 */
const NAMED_TARGETS = ["plan", "platform_staff", "job", "member", "traveller", "person"] as const;

export type NamedTarget = (typeof NAMED_TARGETS)[number];

export function isNamedTarget(targetType: string): targetType is NamedTarget {
  return (NAMED_TARGETS as readonly string[]).includes(targetType);
}
