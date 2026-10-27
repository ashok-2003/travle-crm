// The team's leaderboard, for a role that sees everyone's leads (sales execution): the ten with the most new leads in the
// period, best sales first, each with their leads, conversion (won of their new leads), how fast they first reply, the
// follow-ups they let slip (overdue now) and their sales before GST. The registry Table; numbers right-aligned in mono
// (DESIGN.md "Tables").
import type { Dashboard } from "@travel-crm/contracts/insights";
import { TrophyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { waitWords } from "./duration";

export function TeamTable({ team }: { team: Dashboard["team"] }) {
  const t = useTranslations("dashboard.team");
  const tDuration = useTranslations("dashboard.duration");
  const number = "text-right font-mono tabular-nums";
  const ranked = [...team].sort((a, b) => b.salesPaise - a.salesPaise || b.won - a.won || b.leads - a.leads);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table aria-label={t("title")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("person")}</TableHead>
              <TableHead className="text-right">{t("leads")}</TableHead>
              <TableHead className="text-right">{t("won")}</TableHead>
              <TableHead className="text-right">{t("conversion")}</TableHead>
              <TableHead className="text-right">{t("firstReply")}</TableHead>
              <TableHead className="text-right">{t("overdue")}</TableHead>
              <TableHead className="text-right">{t("sales")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((person, index) => (
              <TableRow key={person.userId}>
                <TableCell className="break-words whitespace-normal">
                  <span className="inline-flex items-center gap-1.5">
                    {index === 0 && person.salesPaise > 0 && (
                      <TrophyIcon aria-label={t("top")} className="size-4 text-status-attention-ink" />
                    )}
                    {person.name ?? <span className="text-muted-foreground">{t("formerStaff")}</span>}
                  </span>
                </TableCell>
                <TableCell className={number}>{formatCount(person.leads)}</TableCell>
                <TableCell className={number}>{formatCount(person.won)}</TableCell>
                <TableCell className={number}>
                  {person.leads === 0 ? "" : `${String(Math.round((person.won * 100) / person.leads))}%`}
                </TableCell>
                <TableCell className={number}>
                  {person.medianFirstReplyMinutes === null ? "" : waitWords(person.medianFirstReplyMinutes, tDuration)}
                </TableCell>
                <TableCell className={cn(number, person.overdue > 0 && "text-status-bad-ink")}>
                  {formatCount(person.overdue)}
                </TableCell>
                <TableCell className={number}>{rupees(person.salesPaise)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
