"use client";

// What a quote earns (release 7b). A quote below the agency's minimum margin shows a warning above it (and again when it is sent),
// never a block: the quote can still go. Whoever may see margins reads the figures; everyone else reads one sentence. A
// quote with lines a package could not price says so, because that quote is not sent until a person prices them.
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { percentText } from "@/lib/percent";
import { useHolds } from "@/session/me-context";
import { useQuoteSettings } from "./use-quotes";

export function MarginNotice({ quote }: { quote: QuoteDetail }) {
  const t = useTranslations("quotes.margin");
  const seesMargin = useHolds("money:view_margin");
  const settings = useQuoteSettings();
  const { margin } = quote;
  if (quote.status !== "draft" && quote.status !== "sent") return null;
  const minimum = settings.data?.minMarginBasisPoints ?? null;
  return (
    <>
      {quote.needsRateLines > 0 && quote.status === "draft" && (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertTitle>{t("needsRateTitle", { count: quote.needsRateLines })}</AlertTitle>
          <AlertDescription>{t("needsRateBody")}</AlertDescription>
        </Alert>
      )}
      {margin.belowMinimum && (
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>{t("belowTitle")}</AlertTitle>
          <AlertDescription>
            {seesMargin && margin.marginBasisPoints !== null
              ? t("belowFigures", {
                  share: percentText(margin.marginBasisPoints),
                  amount: rupees(margin.marginPaise ?? 0),
                  minimum: minimum === null ? "" : percentText(minimum),
                  hasMinimum: String(minimum !== null),
                })
              : t("belowSentence")}{" "}
            {t("stillSends")}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

/** The margin's figures, for whoever may see them: the share, the amount, each traveller's, and how many lines are known. */
export function MarginFigures({ quote }: { quote: QuoteDetail }) {
  const t = useTranslations("quotes.margin");
  const seesMargin = useHolds("money:view_margin");
  const settings = useQuoteSettings();
  const { margin } = quote;
  if (!seesMargin || margin.pricedLines === 0 || margin.marginBasisPoints === null) return null;
  const minimum = settings.data?.minMarginBasisPoints ?? null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-3 gap-3">
          <div className="flex flex-col">
            <dt className="text-caption text-muted-foreground">{t("share")}</dt>
            <dd className="numbers text-section font-semibold">{percentText(margin.marginBasisPoints)}%</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-caption text-muted-foreground">{t("amount")}</dt>
            <dd className="numbers text-section font-semibold">{rupees(margin.marginPaise ?? 0)}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-caption text-muted-foreground">{t("perPerson")}</dt>
            <dd className="numbers text-section font-semibold">{rupees(margin.perPersonPaise ?? 0)}</dd>
          </div>
        </dl>
        <p className="text-caption text-muted-foreground">
          {margin.pricedLines < margin.totalLines
            ? t("known", { priced: margin.pricedLines, total: margin.totalLines })
            : t("knownAll")}
          {minimum === null ? "" : ` ${t("minimum", { minimum: percentText(minimum) })}`}
        </p>
      </CardContent>
    </Card>
  );
}
