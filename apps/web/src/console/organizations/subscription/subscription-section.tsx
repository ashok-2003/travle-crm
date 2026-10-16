"use client";

// The organization's subscription on its page (spec 7.2-7.4): its state today, beside the one the nightly job last
// recorded when they differ; the next change; a suspension made by hand; the plan, the dates and the overrides; the
// price with GST; what support may change; and the payments. Every change goes through subscriptions.*; lifting a
// suspension is a super admin's, the others either level's.
import type { OrganizationRecord } from "@travel-crm/contracts/platform";
import type { SubscriptionDetails, SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { formatDay } from "@/lib/format";
import { isSuperAdmin, useStaff } from "../../session/staff-context";
import { SubscriptionStatusBadge } from "../../subscription-status";
import { rupees } from "../fields/plan-prices";
import { DetailList, DetailSection, type Detail } from "../organization/detail-list";
import { formatCalendarDay } from "./calendar-day";
import { ChangePlanDialog } from "./change-plan-dialog";
import { PaidThroughDialog, TrialEndDialog } from "./dates-dialogs";
import { OverridesDialog } from "./overrides-dialog";
import { PaymentsList } from "./payments-list";
import { PriceBreakdown } from "./price-breakdown";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { EndAccessDialog } from "./reason-dialogs";

/**
 * Whether the trial lasts today, as the api decides (subscriptions/paid-dates.ts): by the state due today, which a
 * suspension by hand hides behind "suspended". That state is the trial recorded, until its last day has passed.
 */
function inTrial(subscription: SubscriptionDetails, today: string): boolean {
  if (subscription.manualSuspension === null) return subscription.status === "trial";
  return (
    subscription.recorded.status === "trial" && (subscription.trialEndsOn === null || subscription.trialEndsOn >= today)
  );
}

export function SubscriptionSection({
  organization,
  subscription: found,
}: {
  organization: OrganizationRecord;
  subscription: SubscriptionWithPayments | null;
}) {
  const t = useTranslations("consoleOrganizations.subscription");
  const tStatus = useTranslations("console.status");
  const staff = useStaff();
  if (!found) {
    return (
      <DetailSection id="subscription-heading" heading={t("heading")}>
        <p className="text-muted-foreground">{t("none")}</p>
      </DetailSection>
    );
  }
  const { subscription, payments } = found;
  const muted = (text: string) => <span className="text-muted-foreground">{text}</span>;
  const day = (date: string | null) =>
    date === null ? muted(t("notSet")) : <span className="numbers">{formatCalendarDay(date)}</span>;
  const recordedDiffers =
    subscription.recorded.status !== subscription.status || subscription.recorded.since !== subscription.since;
  const details: Detail[] = [
    {
      label: t("status"),
      value: (
        <span className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <SubscriptionStatusBadge status={subscription.status} />
            <span className="text-label">{t("since", { date: formatCalendarDay(subscription.since) })}</span>
          </span>
          {recordedDiffers && (
            <span className="text-label text-muted-foreground">
              {t("recorded", {
                status: tStatus(subscription.recorded.status),
                date: formatCalendarDay(subscription.recorded.since),
              })}
            </span>
          )}
        </span>
      ),
    },
    {
      label: t("nextChange"),
      value:
        subscription.nextChangeOn === null
          ? muted(t("noChangeDue"))
          : t("nextChangeOn", { date: formatCalendarDay(subscription.nextChangeOn) }),
    },
    ...(subscription.manualSuspension
      ? [
          {
            label: t("suspendedByHand"),
            value: t("suspendedOn", {
              date: formatDay(new Date(subscription.manualSuspension.at), { timeZone: organization.timeZone }),
              reason: subscription.manualSuspension.reason,
            }),
          },
        ]
      : []),
    {
      label: t("plan"),
      value: t("planAndCycle", { plan: subscription.plan.name, cycle: t(`cycles.${subscription.billingCycle}`) }),
    },
    { label: t("trialEndsOn"), value: day(subscription.trialEndsOn) },
    { label: t("paidThroughOn"), value: day(subscription.paidThrough) },
    { label: t("extraSeats"), value: <span className="numbers">{subscription.extraSeats}</span> },
    {
      label: t("customPrice"),
      value:
        subscription.customPricePaise === null ? (
          muted(t("customPriceNone"))
        ) : (
          <span className="numbers">{rupees(subscription.customPricePaise)}</span>
        ),
    },
    {
      label: t("extraModules"),
      value:
        subscription.extraModules.length === 0
          ? muted(t("noModules"))
          : subscription.extraModules.map((module) => t(`modules.${module}`)).join(", "),
    },
  ];

  return (
    <DetailSection
      id="subscription-heading"
      heading={t("heading")}
      action={<RecordPaymentDialog organizationId={organization.id} timeZone={organization.timeZone} />}
    >
      <DetailList details={details} />
      <PriceBreakdown price={subscription.price} agreed={subscription.customPricePaise !== null} />
      <div className="flex flex-wrap gap-2">
        <ChangePlanDialog subscription={subscription} />
        <OverridesDialog subscription={subscription} />
        {inTrial(subscription, calendarDateIn(new Date(), organization.timeZone)) && (
          <TrialEndDialog subscription={subscription} />
        )}
        <PaidThroughDialog subscription={subscription} />
        {subscription.manualSuspension === null && subscription.status !== "cancelled" && (
          <EndAccessDialog subscription={subscription} change="suspend" />
        )}
        {subscription.manualSuspension !== null && isSuperAdmin(staff) && (
          <EndAccessDialog subscription={subscription} change="liftSuspension" />
        )}
        {subscription.status !== "cancelled" && <EndAccessDialog subscription={subscription} change="cancel" />}
      </div>
      <h3 className="text-section font-semibold">{t("payments.heading")}</h3>
      <PaymentsList organizationId={organization.id} payments={payments} />
    </DetailSection>
  );
}
