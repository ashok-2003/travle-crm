"use client";

// A report's overview (reports): the figures that matter, each against the period before (sales, wins, conversion, the
// average sale, money collected, new leads, how many quotes were accepted, the wait for a first reply, the money still in
// play, leads lost), then the funnel: of the period's new leads, how many were contacted, quoted, asked to book and won,
// each step's share of the one before, so the leak shows.
import type { SalesReport } from "@travel-crm/contracts/reports";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { waitWords } from "@/dashboard/duration";
import { formatCount } from "@/lib/format";
import { FigureTile } from "./figure-tile";
import { percentOf } from "./use-reports";

const share = (part: number, whole: number) => (whole === 0 ? null : (part * 100) / whole);

export function KeyFigures({ report }: { report: SalesReport }) {
  const t = useTranslations("reports.figures");
  const tDuration = useTranslations("dashboard.duration");
  const { figures: now, previous: before } = report;
  const average = (figures: SalesReport["figures"]) =>
    figures.quotesAccepted === 0 ? null : Math.round(figures.salesPaise / figures.quotesAccepted);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3 xl:grid-cols-5">
          {report.showsMoney && (
            <FigureTile
              label={t("sales")}
              value={rupees(now.salesPaise)}
              now={now.salesPaise}
              before={before.salesPaise}
              hint={t("salesHint")}
            />
          )}
          <FigureTile label={t("won")} value={formatCount(now.won)} now={now.won} before={before.won} />
          <FigureTile
            label={t("conversion")}
            value={percentOf(now.won, now.newLeads)}
            now={share(now.won, now.newLeads)}
            before={share(before.won, before.newLeads)}
            hint={t("conversionHint")}
          />
          {report.showsMoney && (
            <>
              <FigureTile
                label={t("averageSale")}
                value={average(now) === null ? "–" : rupees(average(now) ?? 0)}
                now={average(now)}
                before={average(before)}
              />
              <FigureTile
                label={t("collected")}
                value={rupees(now.collectedPaise)}
                now={now.collectedPaise}
                before={before.collectedPaise}
              />
            </>
          )}
          <FigureTile
            label={t("newLeads")}
            value={formatCount(now.newLeads)}
            now={now.newLeads}
            before={before.newLeads}
          />
          <FigureTile
            label={t("quoteAcceptance")}
            value={percentOf(now.quotesAccepted, now.quotesSent)}
            now={share(now.quotesAccepted, now.quotesSent)}
            before={share(before.quotesAccepted, before.quotesSent)}
            note={t("quotesSent", { count: now.quotesSent })}
          />
          <FigureTile
            label={t("firstReply")}
            value={now.medianFirstReplyMinutes === null ? "–" : waitWords(now.medianFirstReplyMinutes, tDuration)}
            now={now.medianFirstReplyMinutes}
            before={before.medianFirstReplyMinutes}
            lessIsBetter
            hint={t("firstReplyHint")}
          />
          {report.showsMoney && (
            <FigureTile
              label={t("pipeline")}
              value={rupees(report.pipelinePaise)}
              note={t("openQuotes", { count: report.openQuotes })}
              hint={t("pipelineHint")}
            />
          )}
          <FigureTile
            label={t("lost")}
            value={formatCount(now.lost)}
            now={now.lost}
            before={before.lost}
            lessIsBetter
          />
        </dl>
      </CardContent>
    </Card>
  );
}

export function Funnel({ report }: { report: SalesReport }) {
  const t = useTranslations("reports.funnel");
  const { figures } = report;
  const steps = [
    { key: "newLeads", value: figures.newLeads },
    { key: "contacted", value: figures.contacted },
    { key: "quoted", value: figures.quoted },
    { key: "bookingRequested", value: figures.bookingRequested },
    { key: "won", value: figures.won },
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {steps.map((step, index) => {
          const previous = index === 0 ? null : (steps[index - 1]?.value ?? 0);
          return (
            <div key={step.key} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{t(step.key)}</span>
                <span className="inline-flex items-baseline gap-2">
                  <span className="text-caption text-muted-foreground">
                    {previous === null
                      ? t("all")
                      : t("ofStep", {
                          share: percentOf(step.value, previous),
                          overall: percentOf(step.value, figures.newLeads),
                        })}
                  </span>
                  <span className="numbers font-semibold">{formatCount(step.value)}</span>
                </span>
              </div>
              <Progress
                value={figures.newLeads === 0 ? 0 : (step.value * 100) / figures.newLeads}
                aria-label={t("barLabel", { step: t(step.key) })}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
