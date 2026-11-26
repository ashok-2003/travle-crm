"use client";

// The invoices, newest first, as a table (it scrolls sideways on a phone): number, type, who it was billed to, total,
// date and status, with the actions at the end of each row.
import type { BillingDetails, InvoiceSummary } from "@travel-crm/contracts/platform";
import { formatMoney, money } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDay } from "@/lib/format";
import { InvoiceActions } from "./invoice-actions";

export function InvoicesTable({ invoices, billing }: { invoices: InvoiceSummary[]; billing: BillingDetails | null }) {
  const t = useTranslations("consoleInvoices.invoices");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("columns.number")}</TableHead>
          <TableHead scope="col">{t("columns.kind")}</TableHead>
          <TableHead scope="col">{t("columns.billedTo")}</TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.total")}
          </TableHead>
          <TableHead scope="col">{t("columns.date")}</TableHead>
          <TableHead scope="col">{t("columns.status")}</TableHead>
          <TableHead scope="col">
            <span className="sr-only">{t("columns.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="numbers whitespace-nowrap">{invoice.number}</TableCell>
            <TableCell>{t(`kinds.${invoice.kind}`)}</TableCell>
            <TableCell className="whitespace-normal wrap-anywhere">{invoice.billToName}</TableCell>
            <TableCell className="numbers text-right whitespace-nowrap">
              {formatMoney(money(invoice.totalPaise))}
            </TableCell>
            <TableCell className="numbers whitespace-nowrap">{formatCalendarDay(invoice.issuedOn)}</TableCell>
            <TableCell>
              <StatusBadge tone={invoice.status === "issued" ? "good" : "neutral"}>
                {t(`statuses.${invoice.status}`)}
              </StatusBadge>
            </TableCell>
            <TableCell>
              <InvoiceActions invoice={invoice} billing={billing} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
