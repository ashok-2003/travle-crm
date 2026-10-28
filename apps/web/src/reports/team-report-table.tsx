"use client";

// The team's performance (reports), for a role that sees every lead: everyone who worked in the period, best sales first,
// with their leads, conversion, first reply, quotes, wins and losses, sales and money collected, messages, notes and
// tasks done, and now their open leads and missed follow-ups. Each name opens their own report.
import type { TeamRow } from "@travel-crm/contracts/reports";
import { TrophyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/text-link";
import { rupees } from "@/components/forms/money-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { waitWords } from "@/dashboard/duration";
import { formatCount } from "@/lib/format";
import { staffReportRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { percentOf } from "./use-reports";

const number = "numbers text-right";

export function TeamReportTable({ team, showsMoney }: { team: TeamRow[]; showsMoney: boolean }) {
  const t = useTranslations("reports.team");
  const tDuration = useTranslations("dashboard.duration");
  const columns = [
    "leads",
    "conversion",
    "firstReply",
    "quotes",
    "won",
    "lost",
    ...(showsMoney ? (["sales", "collected"] as const) : []),
    "messages",
    "notes",
    "tasks",
    "open",
    "overdue",
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent>
        {team.length === 0 ? (
          <p className="text-muted-foreground">{t("none")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("person")}</TableHead>
                {columns.map((column) => (
                  <TableHead key={column} className="text-right">
                    {t(`columns.${column}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.map((row, index) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {showsMoney && index === 0 && row.salesPaise > 0 && (
                        <TrophyIcon aria-label={t("top")} className="size-4 text-status-attention-ink" />
                      )}
                      {row.name === null ? (
                        <span className="text-muted-foreground">{t("formerStaff")}</span>
                      ) : (
                        <TextLink inline href={staffReportRoute(row.userId)}>
                          {row.name}
                        </TextLink>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className={number}>{formatCount(row.leads)}</TableCell>
                  <TableCell className={number}>{percentOf(row.won, row.leads)}</TableCell>
                  <TableCell className={number}>
                    {row.medianFirstReplyMinutes === null ? "–" : waitWords(row.medianFirstReplyMinutes, tDuration)}
                  </TableCell>
                  <TableCell className={number}>{formatCount(row.quotesSent)}</TableCell>
                  <TableCell className={number}>{formatCount(row.won)}</TableCell>
                  <TableCell className={number}>{formatCount(row.lost)}</TableCell>
                  {showsMoney && (
                    <>
                      <TableCell className={cn(number, "font-semibold")}>{rupees(row.salesPaise)}</TableCell>
                      <TableCell className={number}>{rupees(row.collectedPaise)}</TableCell>
                    </>
                  )}
                  <TableCell className={number}>{formatCount(row.messages)}</TableCell>
                  <TableCell className={number}>{formatCount(row.notes)}</TableCell>
                  <TableCell className={number}>{formatCount(row.tasksDone)}</TableCell>
                  <TableCell className={number}>{formatCount(row.openLeads)}</TableCell>
                  <TableCell className={cn(number, row.overdue > 0 && "text-status-bad-ink")}>
                    {formatCount(row.overdue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
