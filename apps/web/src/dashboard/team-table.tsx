// The team's share of the period's new leads, for a role that sees everyone's: the ten with the most, with how many
// they contacted and won. The registry Table; numbers right-aligned in mono (DESIGN.md "Tables").
import type { Dashboard } from "@travel-crm/contracts/insights";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCount } from "@/lib/format";

export function TeamTable({ team }: { team: Dashboard["team"] }) {
  const t = useTranslations("dashboard.team");
  const number = "text-right font-mono tabular-nums";
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
              <TableHead className="text-right">{t("contacted")}</TableHead>
              <TableHead className="text-right">{t("won")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.map((person) => (
              <TableRow key={person.userId}>
                <TableCell className="break-words whitespace-normal">
                  {person.name ?? <span className="text-muted-foreground">{t("formerStaff")}</span>}
                </TableCell>
                <TableCell className={number}>{formatCount(person.leads)}</TableCell>
                <TableCell className={number}>{formatCount(person.contacted)}</TableCell>
                <TableCell className={number}>{formatCount(person.won)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
