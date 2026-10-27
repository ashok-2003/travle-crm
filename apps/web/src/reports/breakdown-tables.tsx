"use client";

// A report's breakdowns (reports): where the period's leads came from and what each source won and earned (so the ad
// money goes where it sells), the destinations asked for most, and why leads were lost, largest first.
import type { SalesReport } from "@travel-crm/contracts/reports";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCount } from "@/lib/format";
import { percentOf } from "./use-reports";

const number = "numbers text-right";

function RowsTable({
  title,
  intro,
  first,
  empty,
  rows,
}: {
  title: string;
  intro: string;
  first: string;
  empty: string;
  rows: { key: string; label: string; leads: number; won: number; salesPaise: number }[];
}) {
  const t = useTranslations("reports.breakdowns");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{intro}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{first}</TableHead>
                <TableHead className="text-right">{t("leads")}</TableHead>
                <TableHead className="text-right">{t("won")}</TableHead>
                <TableHead className="text-right">{t("conversion")}</TableHead>
                <TableHead className="text-right">{t("sales")}</TableHead>
                <TableHead className="text-right">{t("perLead")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className={number}>{formatCount(row.leads)}</TableCell>
                  <TableCell className={number}>{formatCount(row.won)}</TableCell>
                  <TableCell className={number}>{percentOf(row.won, row.leads)}</TableCell>
                  <TableCell className={number}>{rupees(row.salesPaise)}</TableCell>
                  <TableCell className={number}>
                    {row.leads === 0 ? "–" : rupees(Math.round(row.salesPaise / row.leads))}
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

export function SourcesTable({ report }: { report: SalesReport }) {
  const t = useTranslations("reports.breakdowns");
  const tSources = useTranslations("leads.sources");
  return (
    <RowsTable
      title={t("sourcesTitle")}
      intro={t("sourcesIntro")}
      first={t("source")}
      empty={t("noLeads")}
      rows={report.bySource.map((row) => ({ ...row, key: row.source, label: tSources(row.source) }))}
    />
  );
}

export function DestinationsTable({ report }: { report: SalesReport }) {
  const t = useTranslations("reports.breakdowns");
  return (
    <RowsTable
      title={t("destinationsTitle")}
      intro={t("destinationsIntro")}
      first={t("destination")}
      empty={t("noDestinations")}
      rows={report.byDestination.map((row) => ({ ...row, key: row.name, label: row.name }))}
    />
  );
}

export function LostReasonsCard({ report }: { report: SalesReport }) {
  const t = useTranslations("reports.breakdowns");
  const tReasons = useTranslations("sales.lost.reasons");
  const total = report.lostReasons.reduce((sum, row) => sum + row.leads, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("lostTitle")}</CardTitle>
        <CardDescription>{t("lostIntro", { count: total })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {report.lostReasons.length === 0 ? (
          <p className="text-muted-foreground">{t("noLost")}</p>
        ) : (
          report.lostReasons.map((row) => {
            const label = row.reason === null ? t("noReason") : tReasons(row.reason);
            return (
              <div key={row.reason ?? "none"} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span>{label}</span>
                  <span className="inline-flex items-baseline gap-2">
                    <span className="text-caption text-muted-foreground">{percentOf(row.leads, total)}</span>
                    <span className="numbers font-semibold">{formatCount(row.leads)}</span>
                  </span>
                </div>
                <Progress value={total === 0 ? 0 : (row.leads * 100) / total} aria-label={label} />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
