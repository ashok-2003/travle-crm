// The plan's name and the day it is paid through, at the top of Plan & billing.
import type { BillingView } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { formatCalendarDay } from "@/lib/format";

export function PlanSummary({ billing }: { billing: BillingView }) {
  const t = useTranslations("planBilling.summary");
  return (
    <Details
      rows={[
        { label: t("plan"), value: billing.planName },
        {
          label: t("paidTill"),
          value: billing.paidThrough === null ? t("notPaid") : formatCalendarDay(billing.paidThrough),
        },
      ]}
    />
  );
}
