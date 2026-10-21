// The dashboard's key figures: four headline cards (new leads, won, conversion, first reply), each with its icon, its
// value, how it moved against the period before (up is good for most; for the wait, down is) and how it is counted;
// then four smaller figures for the day's state. Shares are of the period's new leads.
import type { Dashboard } from "@travel-crm/contracts/insights";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CalendarClockIcon,
  ClockIcon,
  FileTextIcon,
  InboxIcon,
  MessageCircleReplyIcon,
  PercentIcon,
  TrophyIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/info-hint";
import { Card, CardContent } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { waitWords } from "./duration";

const percentOf = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/** Each figure's icon tile, in the colour of what it is about: people, the action, money, or attention. */
const tones = {
  people: "bg-people-tint text-people-tint-ink",
  action: "bg-action-tint text-action-pressed",
  money: "bg-money-tint text-money",
  attention: "bg-status-attention-fill text-status-attention-ink",
} as const;

interface Figure {
  key: "newLeads" | "won" | "conversion" | "firstReply" | "contacted" | "quotesSent" | "open" | "overdue";
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: keyof typeof tones;
  /** How the figure moved, in percent, and whether a rise is good; null when there is nothing to compare. */
  change?: { percent: number; riseIsGood: boolean } | null;
}

function changeOf(now: number | null, before: number | null, riseIsGood = true): NonNullable<Figure["change"]> | null {
  if (now === null || before === null || before === 0) return null;
  return { percent: Math.round(((now - before) / before) * 100), riseIsGood };
}

function Change({ change }: { change: NonNullable<Figure["change"]> }) {
  const t = useTranslations("dashboard.kpis");
  const rose = change.percent >= 0;
  const good = rose === change.riseIsGood;
  const Arrow = rose ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-badge px-1.5 py-0.5 text-caption font-medium",
        good ? "bg-status-good-fill text-status-good-ink" : "bg-status-bad-fill text-status-bad-ink",
      )}
    >
      <Arrow aria-hidden="true" className="size-3.5" />
      {t("change", { percent: Math.abs(change.percent), direction: rose ? "up" : "down" })}
    </span>
  );
}

function HeadlineCard({ figure, label }: { figure: Figure; label: string }) {
  const t = useTranslations("dashboard.kpis");
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 sm:gap-3">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1 text-label text-muted-foreground">
            {label}
            <InfoHint term={label}>{figure.hint}</InfoHint>
          </span>
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tones[figure.tone])}>
            <figure.icon aria-hidden="true" className="size-4.5" />
          </span>
        </div>
        <p className="font-mono text-number-lg font-medium tabular-nums sm:text-title">{figure.value}</p>
        <div className="flex flex-wrap items-center gap-2">
          {figure.change ? (
            <Change change={figure.change} />
          ) : (
            <span className="text-caption text-muted-foreground">{t("noChange")}</span>
          )}
          {figure.change && (
            <span className="hidden text-caption text-muted-foreground sm:inline">{t("vsBefore")}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SmallFigure({ figure, label }: { figure: Figure; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tones[figure.tone])}>
        <figure.icon aria-hidden="true" className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1 text-label text-muted-foreground">
          {label}
          <InfoHint term={label}>{figure.hint}</InfoHint>
        </span>
        <span className="font-mono text-number-lg font-medium tabular-nums">{figure.value}</span>
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
      icon: UsersIcon,
      tone: "people",
      change: changeOf(totals.newLeads, previous.newLeads),
    },
    {
      key: "won",
      value: formatCount(totals.won),
      hint: t("won.hint"),
      icon: TrophyIcon,
      tone: "money",
      change: changeOf(totals.won, previous.won),
    },
    {
      key: "conversion",
      value: t("conversion.value", { percent: conversion }),
      hint: t("conversion.hint"),
      icon: PercentIcon,
      tone: "action",
      change: changeOf(conversion, conversionBefore),
    },
    {
      key: "firstReply",
      value:
        totals.medianFirstReplyMinutes === null
          ? t("firstReply.none")
          : waitWords(totals.medianFirstReplyMinutes, tDuration),
      hint: t("firstReply.hint"),
      icon: MessageCircleReplyIcon,
      tone: "attention",
      change: changeOf(totals.medianFirstReplyMinutes, previous.medianFirstReplyMinutes, false),
    },
  ];
  const small: Figure[] = [
    {
      key: "contacted",
      value: t("contacted.value", { percent: percentOf(totals.contacted, totals.newLeads) }),
      hint: t("contacted.hint", { count: totals.contacted }),
      icon: ClockIcon,
      tone: "action",
    },
    {
      key: "quotesSent",
      value: formatCount(totals.quotesSent),
      hint: t("quotesSent.hint"),
      icon: FileTextIcon,
      tone: "people",
    },
    { key: "open", value: formatCount(totals.open), hint: t("open.hint"), icon: InboxIcon, tone: "action" },
    {
      key: "overdue",
      value: formatCount(totals.overdue),
      hint: t("overdue.hint"),
      icon: CalendarClockIcon,
      tone: "attention",
    },
  ];
  return (
    <section aria-label={t("label")} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {headline.map((figure) => (
          <HeadlineCard key={figure.key} figure={figure} label={t(`${figure.key}.label`)} />
        ))}
      </div>
      <Card>
        <CardContent className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {small.map((figure) => (
            <SmallFigure key={figure.key} figure={figure} label={t(`${figure.key}.label`)} />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
