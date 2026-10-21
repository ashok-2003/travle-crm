"use client";

// The organization's subscription on its page (spec 7.2-7.4): its state today, beside the one the nightly job last
// recorded when they differ; the next change; a suspension made by hand; the plan, the dates and the overrides; the
// price with GST; and the payments. Its header holds what support may change: the Change menu
// (subscription-changes.tsx) and Record a payment, the primary. Every change goes through subscriptions.*. Dates are
// written as in a sentence, in Figtree, wherever they sit in the list; money and counts are mono.
import type { OrganizationRecord } from "@travel-crm/contracts/platform";
import type { SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { formatCalendarDay, formatDay } from "@/lib/format";
import { SubscriptionStatusBadge } from "../../subscription-status";
import { rupees } from "@/components/forms/money-field";
import { DetailList, DetailSection, type Detail } from "../organization/detail-list";
import { PaymentsList } from "./payments-list";
import { PriceBreakdown } from "./price-breakdown";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { SubscriptionChanges } from "./subscription-changes";

export function SubscriptionSection({
  organization,
  subscription: found,
}: {
  organization: OrganizationRecord;
  subscription: SubscriptionWithPayments | null;
}) {
  const t = useTranslations("consoleOrganizations.subscription");
  const tStatus = useTranslations("console.status");
  if (!found) {
    return (
      <DetailSection id="subscription-heading" heading={t("heading")}>
        <p className="text-muted-foreground">{t("none")}</p>
      </DetailSection>
    );
  }
  const { subscription, payments } = found;
  const muted = (text: string) => <span className="text-muted-foreground">{text}</span>;
  const day = (date: string | null) => (date === null ? muted(t("notSet")) : formatCalendarDay(date));
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
      action={
        <span className="flex flex-wrap gap-2">
          <SubscriptionChanges organization={organization} subscription={subscription} />
          <RecordPaymentDialog organizationId={organization.id} timeZone={organization.timeZone} />
        </span>
      }
    >
      <DetailList details={details} />
      <PriceBreakdown price={subscription.price} agreed={subscription.customPricePaise !== null} />
      <h3 className="text-section font-semibold">{t("payments.heading")}</h3>
      <PaymentsList organizationId={organization.id} payments={payments} />
    </DetailSection>
  );
}
