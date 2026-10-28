"use client";

// Finance's overview (step 6, P0): over the period, what the bookings brought in before GST, what they cost, the running
// costs, and the profit left; the GST collected for the government; what customers paid; and, now, what customers still
// owe and what the agency still owes suppliers. Then six months side by side, and where the running costs went.
import type { FinancePeriodInput } from "@travel-crm/contracts/finance";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { rupees } from "@/components/forms/money-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useFinanceSummary } from "./use-finance";

const monthWords = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

function Figure({ label, paise, note, tone }: { label: string; paise: number; note?: string; tone?: "profit" }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "numbers text-section font-semibold",
          tone === "profit" && (paise < 0 ? "text-status-bad-ink" : "text-status-good-ink"),
        )}
      >
        {rupees(paise)}
      </dd>
      {note !== undefined && <dd className="text-caption text-muted-foreground">{note}</dd>}
    </div>
  );
}

export function FinanceOverview({ period }: { period: FinancePeriodInput }) {
  const t = useTranslations("finance.overview");
  const tCategory = useTranslations("finance.expenseForm.categories");
  const summary = useFinanceSummary(period);
  if (summary.data === undefined) {
    return summary.isError ? (
      <LoadFailedAlert message={t("loadFailed")} error={summary.error} onRetry={() => void summary.refetch()} />
    ) : (
      <LoadingRows shape="twoLines" label={t("loading")} />
    );
  }
  const data = summary.data;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("profitTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <Figure label={t("revenue")} paise={data.revenuePaise} note={t("bookings", { count: data.bookings })} />
            <Figure label={t("tripCosts")} paise={data.tripCostPaise} note={t("tripCostsNote")} />
            <Figure label={t("grossProfit")} paise={data.grossProfitPaise} tone="profit" />
            <Figure label={t("expenses")} paise={data.expensePaise} note={t("expensesNote")} />
            <Figure label={t("netProfit")} paise={data.netProfitPaise} tone="profit" note={t("netProfitNote")} />
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("cashTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Figure label={t("collected")} paise={data.collectedPaise} note={t("collectedNote")} />
            <Figure label={t("receivable")} paise={data.receivablePaise} note={t("receivableNote")} />
            <Figure label={t("payable")} paise={data.payablePaise} note={t("payableNote")} />
            <Figure label={t("gst")} paise={data.gstPaise} note={t("gstNote")} />
          </dl>
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("monthsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("month")}</TableHead>
                  <TableHead className="text-right">{t("revenue")}</TableHead>
                  <TableHead className="text-right">{t("costs")}</TableHead>
                  <TableHead className="text-right">{t("netProfit")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.months.map((month) => (
                  <TableRow key={month.month}>
                    <TableCell>{monthWords.format(new Date(`${month.month}-01T00:00:00Z`))}</TableCell>
                    <TableCell className="numbers text-right">{rupees(month.revenuePaise)}</TableCell>
                    <TableCell className="numbers text-right">
                      {rupees(month.tripCostPaise + month.expensePaise)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "numbers text-right font-semibold",
                        month.netProfitPaise < 0 && "text-status-bad-ink",
                      )}
                    >
                      {rupees(month.netProfitPaise)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("whereTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.expensesByCategory.length === 0 ? (
              <p className="text-muted-foreground">{t("noExpenses")}</p>
            ) : (
              <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
                {data.expensesByCategory.map((row) => (
                  <div key={row.category} className="contents">
                    <dt>{tCategory(row.category)}</dt>
                    <dd className="numbers text-right">{rupees(row.amountPaise)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
