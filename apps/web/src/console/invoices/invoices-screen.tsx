"use client";

// The console's invoices (a super admin's alone: money): every invoice made by hand, newest first, a page at a time,
// to download again, copy or cancel, and New invoice, which waits for the firm's billing details (they go on every
// invoice). Support never sees it in the navigation; opening it says it is a super admin's, and asks nothing of the api,
// which would refuse.
import { ReceiptTextIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { ShowMoreButton } from "@/components/show-more-button";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { consoleRoutes } from "../routes";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { NewInvoiceButton } from "./invoice-dialog";
import { InvoicesTable } from "./invoices-table";
import { useBillingDetails, useInvoices } from "./use-invoices";

function Invoices() {
  const t = useTranslations("consoleInvoices.invoices");
  const tCommon = useTranslations("common");
  const details = useBillingDetails();
  const invoices = useInvoices();
  const billing = details.data ?? null;
  const list = () => {
    if (invoices.items === undefined) {
      return invoices.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={invoices.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void invoices.refetch()}
        />
      ) : (
        <LoadingRows rows={3} shape="table" columns={6} label={t("loading")} />
      );
    }
    if (invoices.items.length === 0) return <EmptyState icon={ReceiptTextIcon} message={t("empty")} />;
    return (
      <>
        <InvoicesTable invoices={invoices.items} billing={billing} />
        <ShowMoreButton pages={invoices} label={t("showMore")} />
      </>
    );
  };
  return (
    <>
      <PageHeader
        title={t("title")}
        intro={t("intro")}
        action={
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              <Link href={consoleRoutes.billingDetails}>{t("billingDetails")}</Link>
            </Button>
            <NewInvoiceButton billing={details.data} />
          </div>
        }
      />
      {details.isSuccess && billing === null && (
        <Alert>
          <AlertDescription>
            {t("needsBillingDetails")}{" "}
            <TextLink href={consoleRoutes.billingDetails} inline>
              {t("goToBillingDetails")}
            </TextLink>
          </AlertDescription>
        </Alert>
      )}
      {details.isError && (
        <LoadFailedAlert
          message={t("billingDetailsLoadFailed")}
          error={details.error}
          onRetry={() => void details.refetch()}
        />
      )}
      {list()}
    </>
  );
}

export function InvoicesScreen() {
  const t = useTranslations("consoleInvoices.invoices");
  const superAdmin = isSuperAdmin(useStaff());
  if (!superAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} intro={t("intro")} />
        <p>{t("superAdminsOnly")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <Invoices />
    </div>
  );
}
