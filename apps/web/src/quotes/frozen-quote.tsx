"use client";

// A quote that was sent, read as text laid out like the customer's link (no inputs to look editable, nothing to add or
// delete): its trip, the plan day by day, the priced lines with their quantities, the GST and total, and its words.
import { gstStates } from "@travel-crm/contracts/kernel";
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableRow } from "@/components/ui/table";
import { formatCalendarDay } from "@/lib/format";

function Words({ title, text }: { title: string; text: string }) {
  if (text.trim() === "") return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-line">{text}</p>
      </CardContent>
    </Card>
  );
}

export function FrozenQuote({ quote }: { quote: QuoteDetail }) {
  const t = useTranslations("quotes.form");
  const tFrozen = useTranslations("quotes.frozen");
  const place =
    quote.placeOfSupply === null
      ? t("placeSame")
      : quote.placeOfSupply === "OUTSIDE_INDIA"
        ? t("placeOutside")
        : (gstStates.find((state) => state.code === quote.placeOfSupply)?.name ?? quote.placeOfSupply);
  const travellers = [
    tFrozen("adults", { count: quote.adults }),
    quote.children > 0 ? tFrozen("children", { count: quote.children }) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("trip")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="font-medium">{quote.title}</p>
          <p className="text-muted-foreground">
            {[
              quote.startDate === null ? null : tFrozen("from", { day: formatCalendarDay(quote.startDate) }),
              travellers,
            ]
              .filter((part): part is string => part !== null)
              .join(" · ")}
          </p>
        </CardContent>
      </Card>
      {quote.days.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("days")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {quote.days.map((day, index) => (
                <li key={`${String(index)}-${day.title}`}>
                  <p className="font-medium">{tFrozen("day", { day: index + 1, title: day.title })}</p>
                  {day.description !== "" && (
                    <p className="whitespace-pre-line text-muted-foreground">{day.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("price")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Table>
            <TableBody>
              {quote.items.map((item, index) => (
                <TableRow key={`${String(index)}-${item.description}`}>
                  <TableCell className="whitespace-normal">
                    {item.description}
                    {item.detail !== "" && (
                      <span className="block text-caption text-muted-foreground">{item.detail}</span>
                    )}
                    <span className="numbers block text-caption text-muted-foreground">
                      {tFrozen("line", { quantity: item.quantity, price: rupees(item.unitPricePaise) })}
                    </span>
                  </TableCell>
                  <TableCell className="numbers text-right">{rupees(item.unitPricePaise * item.quantity)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>{t("subtotal")}</TableCell>
                <TableCell className="numbers text-right">{rupees(quote.totals.subtotalPaise)}</TableCell>
              </TableRow>
              {quote.totals.taxPaise > 0 && (
                <TableRow>
                  <TableCell>{t("gst", { rate: quote.taxRateBasisPoints / 100 })}</TableCell>
                  <TableCell className="numbers text-right">{rupees(quote.totals.taxPaise)}</TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">{t("total")}</TableCell>
                <TableCell className="numbers text-right font-semibold">{rupees(quote.totals.totalPaise)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className="text-caption text-muted-foreground">{tFrozen("place", { place })}</p>
        </CardContent>
      </Card>
      <Words title={t("inclusions")} text={quote.inclusions} />
      <Words title={t("exclusions")} text={quote.exclusions} />
      <Words title={t("notes")} text={quote.notes} />
    </div>
  );
}
