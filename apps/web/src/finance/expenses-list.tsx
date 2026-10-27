"use client";

// The agency's running costs in the period (step 6, P0), newest first, with Add and, for one entered by mistake, Void.
import type { FinancePeriodInput } from "@travel-crm/contracts/finance";
import { ReceiptIndianRupeeIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDay } from "@/lib/format";
import { useHolds } from "@/session/me-context";
import { AddExpenseDialog } from "./finance-dialogs";
import { useExpenses, useFinanceChanges } from "./use-finance";

export function ExpensesList({ period }: { period: FinancePeriodInput }) {
  const t = useTranslations("finance.expenses");
  const tCategory = useTranslations("finance.expenseForm.categories");
  const mayAdd = useHolds("accounts:create");
  const mayEdit = useHolds("accounts:edit");
  const expenses = useExpenses(period);
  const { voidExpense } = useFinanceChanges();
  const [voiding, setVoiding] = useState<string | null>(null);
  const body = () => {
    if (expenses.data === undefined) {
      return expenses.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={expenses.error}
          retryLabel={t("retry")}
          onRetry={() => void expenses.refetch()}
        />
      ) : (
        <LoadingRows shape="table" columns={4} label={t("loading")} />
      );
    }
    if (expenses.data.length === 0) return <EmptyState icon={ReceiptIndianRupeeIcon} message={t("empty")} />;
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.what")}</TableHead>
            <TableHead>{t("columns.category")}</TableHead>
            <TableHead>{t("columns.day")}</TableHead>
            <TableHead className="text-right">{t("columns.amount")}</TableHead>
            {mayEdit && (
              <TableHead>
                <span className="sr-only">{t("columns.actions")}</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.data.map((expense) => (
            <TableRow key={expense.id}>
              <TableCell>
                {expense.description}
                {expense.note !== "" && <p className="text-caption text-muted-foreground">{expense.note}</p>}
              </TableCell>
              <TableCell>{tCategory(expense.category)}</TableCell>
              <TableCell>{formatCalendarDay(expense.spentOn)}</TableCell>
              <TableCell className="numbers text-right">{rupees(expense.amountPaise)}</TableCell>
              {mayEdit && (
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("voidNamed", { what: expense.description })}
                    onClick={() => {
                      setVoiding(expense.id);
                    }}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      {mayAdd && (
        <div className="flex justify-end">
          <AddExpenseDialog />
        </div>
      )}
      {body()}
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(next) => {
          if (!next) setVoiding(null);
        }}
        title={t("voidTitle")}
        description={t("voidDescription")}
        action={t("void")}
        request={voidExpense}
        onConfirm={() => {
          if (voiding === null) return;
          voidExpense.mutate(
            { expenseId: voiding },
            {
              onSuccess: () => {
                setVoiding(null);
              },
            },
          );
        }}
      />
    </div>
  );
}
