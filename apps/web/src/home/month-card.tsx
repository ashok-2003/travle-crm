"use client";

// Home's month so far (sales execution): sales, bookings won, conversion and the money collected, each against last
// month's same days, with the way to the full reports.
import { useTranslations } from "next-intl";
import Link from "next/link";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { routes } from "@/lib/routes";
import { FigureTile } from "@/reports/figure-tile";
import { percentOf, useSalesReport } from "@/reports/use-reports";

const share = (part: number, whole: number) => (whole === 0 ? null : (part * 100) / whole);

export function MonthCard() {
  const t = useTranslations("home.month");
  const report = useSalesReport("month").data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{report?.scope === "own" ? t("introOwn") : t("intro")}</CardDescription>
        <CardAction>
          <Button asChild variant="outline">
            <Link href={routes.reports}>{t("reports")}</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {report === undefined ? (
          <p className="text-muted-foreground">{t("loading")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {report.showsMoney && (
              <FigureTile
                label={t("sales")}
                value={rupees(report.figures.salesPaise)}
                now={report.figures.salesPaise}
                before={report.previous.salesPaise}
              />
            )}
            <FigureTile
              label={t("won")}
              value={formatCount(report.figures.won)}
              now={report.figures.won}
              before={report.previous.won}
            />
            <FigureTile
              label={t("conversion")}
              value={percentOf(report.figures.won, report.figures.newLeads)}
              now={share(report.figures.won, report.figures.newLeads)}
              before={share(report.previous.won, report.previous.newLeads)}
              note={t("ofLeads", { count: report.figures.newLeads })}
            />
            {report.showsMoney && (
              <FigureTile
                label={t("collected")}
                value={rupees(report.figures.collectedPaise)}
                now={report.figures.collectedPaise}
                before={report.previous.collectedPaise}
              />
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
