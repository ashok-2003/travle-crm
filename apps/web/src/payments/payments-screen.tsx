"use client";

// /payments (plan 3, payments to check): every payment that waits for a person's word, oldest first: a customer's "I've
// paid", the proof sent to the AI for a booking, and a screenshot no booking waits for. The AI never confirms money; here a
// person does, and the customer is then told by code.
import { WalletIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { ShowMoreButton } from "@/components/show-more-button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { PaymentRow } from "./payment-row";
import { usePaymentsToCheck } from "./use-payments";

export function PaymentsScreen() {
  const t = useTranslations("payments");
  const tCommon = useTranslations("common");
  const list = usePaymentsToCheck();
  const access = useWriteAccess("change");
  const hintId = useId();
  const body = () => {
    if (list.items === undefined) {
      return list.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={list.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <LoadingRows shape="table" columns={3} label={t("loading")} />
      );
    }
    if (list.items.length === 0) return <EmptyState icon={WalletIcon} message={t("empty")} />;
    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.payment")}</TableHead>
              <TableHead>{t("columns.amounts")}</TableHead>
              <TableHead>{t("columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.items.map((payment) => (
              <PaymentRow key={`${payment.kind}-${payment.id}`} payment={payment} hintId={hintId} />
            ))}
          </TableBody>
        </Table>
        <ShowMoreButton pages={list} label={t("more")} />
      </>
    );
  };
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      <WriteHint id={hintId} hint={access.hint} />
      {body()}
    </div>
  );
}
