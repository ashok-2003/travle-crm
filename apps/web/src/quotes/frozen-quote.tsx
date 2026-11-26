"use client";

// A quote that was sent, read as text laid out like the customer's link (no inputs to look editable, nothing to add or
// delete): its priced lines with the GST and total first, then the plan as day boxes, the inclusions ticked in green,
// the exclusions crossed and the notes as points. The trip's name, date and people are the page header's.
import { gstStates } from "@travel-crm/contracts/kernel";
import { pointsOf, type QuoteDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cardTints } from "@/components/card-tints";
import { rupees } from "@/components/forms/money-field";
import { DayBoxes } from "@/components/trip-plan/day-boxes";
import { PointList } from "@/components/trip-plan/point-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableRow } from "@/components/ui/table";

function Points({
  title,
  text,
  tone,
  tint,
}: {
  title: string;
  text: string;
  tone: "included" | "excluded" | "plain";
  tint?: boolean | undefined;
}) {
  if (pointsOf(text).length === 0) return null;
  return (
    <Words title={title} tint={tint}>
      <PointList text={text} tone={tone} />
    </Words>
  );
}

function Words({ title, tint = false, children }: { title: string; tint?: boolean | undefined; children: ReactNode }) {
  return (
    <Card className={tint ? cardTints.good : undefined}>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
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
  return (
    // Below the two columns this div is not a box, so Price and Payments (the screen's other column) can lead the plan.
    <div className="flex flex-col gap-6 max-xl:contents">
      <Card className="max-xl:-order-2">
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
      {quote.days.length > 0 && (
        <Words title={t("days")}>
          <DayBoxes days={quote.days} />
        </Words>
      )}
      <Points title={t("inclusions")} text={quote.inclusions} tone="included" tint />
      <Points title={t("exclusions")} text={quote.exclusions} tone="excluded" />
      <Points title={t("notes")} text={quote.notes} tone="plain" />
    </div>
  );
}
