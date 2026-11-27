// The payments recorded for the agency, newest first: the day, the amount and the reference. Voided ones are left out
// by the api.
import type { BillingView } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDay, formatRupees } from "@/lib/format";
import { money } from "@travel-crm/domain/kernel";

export function PaymentsTable({ payments }: { payments: BillingView["payments"] }) {
  const t = useTranslations("planBilling.payments");
  return (
    <section aria-labelledby="plan-payments-heading" className="flex flex-col gap-3">
      <h2 id="plan-payments-heading" className="text-section font-semibold">
        {t("heading")}
      </h2>
      {payments.length === 0 ? (
        <p className="text-muted-foreground">{t("none")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
              <TableHead>{t("reference")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment, index) => (
              <TableRow key={`${payment.paidOn}-${String(index)}`}>
                <TableCell>{formatCalendarDay(payment.paidOn)}</TableCell>
                <TableCell className="numbers text-right">{formatRupees(money(payment.amountPaise))}</TableCell>
                <TableCell>{payment.reference ?? t("noReference")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
