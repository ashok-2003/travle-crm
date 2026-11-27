"use client";

// Plan & billing (paid-plans spec, part B): the plan and the day it is paid through, what it includes beside this
// month's use, the payments recorded, and how to renew. Read only: nothing here changes anything.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { useTRPC } from "@/data/trpc";
import { SupportContacts } from "@/subscription/support-contacts";
import { PaymentsTable } from "./payments-table";
import { PlanSummary } from "./plan-summary";
import { PlanUsage } from "./plan-usage";

export function PlanScreen() {
  const t = useTranslations("planBilling");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const billing = useQuery(trpc.subscription.billing.queryOptions());
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      {billing.data ? (
        <>
          <PlanSummary billing={billing.data} />
          <PlanUsage billing={billing.data} />
          <PaymentsTable payments={billing.data.payments} />
          <SupportContacts />
        </>
      ) : billing.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={billing.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void billing.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" />
      )}
    </div>
  );
}
