// The dashboard's key figures as one quiet strip in one card, divided by hairlines: each figure is its label with its
// hint, its mono value and, only when there is a period before to compare with, how it moved (up is good for most; for
// the wait, down is). Shares are of the period's new leads.
import type { Dashboard } from "@travel-crm/contracts/insights";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/info-hint";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCount } from "@/lib/format";
import { waitWords } from "./duration";

const percentOf = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

interface Figure {
  key: "newLeads" | "won" | "conversion" | "firstReply" | "contacted" | "quotesSent" | "open" | "overdue";
  value: string;
  hint: string;
  /** How the figure moved, in percent; null when there is nothing to compare. */
  change?: { percent: number } | null;
}

function changeOf(now: number | null, before: number | null): NonNullable<Figure["change"]> | null {
  if (now === null || before === null || before === 0) return null;
  return { percent: Math.round(((now - before) / before) * 100) };
}

/** One figure, with the hairlines that divide it from its neighbours: two columns on a phone, four from a tablet up. */
function FigureCell({ figure, label, index }: { figure: Figure; label: string; index: number }) {
  const t = useTranslations("dashboard.kpis");
  const rowAbove = index >= 2;
  const rowAboveOnWide = index >= 4;
  // A hairline follows a figure with a neighbour to its right: always in a phone's first column, in a tablet's first three.
  const lineAfter = index % 2 === 0 ? "" : index % 4 === 3 ? null : "hidden md:block";
  return (
    <div role="group" aria-label={label} className="flex flex-col">
      {rowAbove && <Separator className={rowAboveOnWide ? "" : "md:hidden"} />}
      <div className="flex flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
          <span className="flex items-center gap-1 text-label text-muted-foreground">
            {label}
            <InfoHint term={label}>{figure.hint}</InfoHint>
          </span>
          <p className="font-mono text-number-lg font-medium tabular-nums">{figure.value}</p>
          {figure.change && (
            <p className="text-caption text-muted-foreground">
              {t("change", {
                percent: Math.abs(figure.change.percent),
                direction: figure.change.percent >= 0 ? "up" : "down",
              })}{" "}
              {t("vsBefore")}
            </p>
          )}
        </div>
        {lineAfter !== null && <Separator orientation="vertical" className={lineAfter} />}
      </div>
    </div>
  );
}

export function KpiStrip({ totals, previous }: { totals: Dashboard["totals"]; previous: Dashboard["previous"] }) {
  const t = useTranslations("dashboard.kpis");
  const tDuration = useTranslations("dashboard.duration");
  const conversion = percentOf(totals.newLeadsWon, totals.newLeads);
  const conversionBefore = previous.newLeads === 0 ? null : percentOf(previous.newLeadsWon, previous.newLeads);
  const headline: Figure[] = [
    {
      key: "newLeads",
      value: formatCount(totals.newLeads),
      hint: t("newLeads.hint"),
      change: changeOf(totals.newLeads, previous.newLeads),
    },
    {
      key: "won",
      value: formatCount(totals.won),
      hint: t("won.hint"),
      change: changeOf(totals.won, previous.won),
    },
    {
      key: "conversion",
      value: t("conversion.value", { percent: conversion }),
      hint: t("conversion.hint"),
      change: changeOf(conversion, conversionBefore),
    },
    {
      key: "firstReply",
      value:
        totals.medianFirstReplyMinutes === null
          ? t("firstReply.none")
          : waitWords(totals.medianFirstReplyMinutes, tDuration),
      hint: t("firstReply.hint"),
      change: changeOf(totals.medianFirstReplyMinutes, previous.medianFirstReplyMinutes),
    },
  ];
  const small: Figure[] = [
    {
      key: "contacted",
      value: t("contacted.value", { percent: percentOf(totals.contacted, totals.newLeads) }),
      hint: t("contacted.hint", { count: totals.contacted }),
    },
    {
      key: "quotesSent",
      value: formatCount(totals.quotesSent),
      hint: t("quotesSent.hint"),
    },
    { key: "open", value: formatCount(totals.open), hint: t("open.hint") },
    {
      key: "overdue",
      value: formatCount(totals.overdue),
      hint: t("overdue.hint"),
    },
  ];
  const figures = [...headline, ...small];
  return (
    <Card aria-label={t("label")} role="region">
      <CardContent className="grid grid-cols-2 md:grid-cols-4">
        {figures.map((figure, index) => (
          <FigureCell key={figure.key} figure={figure} label={t(`${figure.key}.label`)} index={index} />
        ))}
      </CardContent>
    </Card>
  );
}
