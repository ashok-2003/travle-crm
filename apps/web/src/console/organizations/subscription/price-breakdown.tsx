// What the subscription costs per billing cycle, as the api computes it (spec 7.2): the plan's price or the agreed
// one, the extra seats, the amount before GST, GST at 18 %, and the total. GST is one row until the platform's own
// GSTIN and state are set: they decide whether it splits into CGST and SGST or is IGST, which tax invoices will show.
// Amounts are mono and right-aligned with ₹ and Indian grouping, paise shown, in ink: they are due, not received.
import type { SubscriptionPrice } from "@travel-crm/contracts/subscriptions";
import { money } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { formatRupees } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PriceBreakdown({ price, agreed }: { price: SubscriptionPrice; agreed: boolean }) {
  const t = useTranslations("consoleOrganizations.subscription.price");
  const amount = (paise: number) => formatRupees(money(paise), { paise: "always" });
  const lines = [
    { label: agreed ? t("agreed") : t("plan"), paise: price.basePaise },
    ...(price.extraSeats > 0
      ? [{ label: t("extraSeats", { count: price.extraSeats }), paise: price.extraSeatsPaise }]
      : []),
    { label: t("subtotal"), paise: price.subtotalPaise },
    { label: t("gst"), paise: price.gstPaise },
    { label: t(`total.${price.cycle}`), paise: price.totalPaise, total: true },
  ];
  return (
    <Table className="max-w-[720px]">
      <TableCaption className="text-left">{t(`caption.${price.cycle}`)}</TableCaption>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.label}>
            <TableHead scope="row" className={cn("font-normal", line.total === true && "font-semibold")}>
              {line.label}
            </TableHead>
            <TableCell className={cn("numbers text-right", line.total === true && "font-medium")}>
              {amount(line.paise)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
