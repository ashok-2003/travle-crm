"use client";

// This month's AI by feature and by model: calls, the failed, tokens read and written, and cost (a model with no known
// price says so). Two registry Tables side by side on a wide screen.
import type { AiFigures, AiOverview } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCount } from "@/lib/format";
import { rupeesOf } from "../growth/usage-screen";
import { useFeatureName } from "./feature-name";

interface Row extends AiFigures {
  key: string;
  name: string;
  priced: boolean;
}

function BreakdownTable({ title, nameHeading, rows }: { title: string; nameHeading: string; rows: Row[] }) {
  const t = useTranslations("consoleAi.breakdown");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{nameHeading}</TableHead>
                <TableHead className="text-right">{t("calls")}</TableHead>
                <TableHead className="text-right">{t("failed")}</TableHead>
                <TableHead className="text-right">{t("tokens")}</TableHead>
                <TableHead className="text-right">{t("cost")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="break-all">{row.name}</TableCell>
                  <TableCell className="numbers text-right">{formatCount(row.calls)}</TableCell>
                  <TableCell className="numbers text-right">{formatCount(row.failed)}</TableCell>
                  <TableCell className="numbers text-right">
                    {formatCount(row.inputTokens)} / {formatCount(row.outputTokens)}
                  </TableCell>
                  <TableCell className="numbers text-right">
                    {row.priced ? rupeesOf(row.costPaise) : t("unpriced")}
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

export function AiBreakdown({ byFeature, byModel }: Pick<AiOverview, "byFeature" | "byModel">) {
  const t = useTranslations("consoleAi");
  const featureName = useFeatureName();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <BreakdownTable
        title={t("breakdown.features")}
        nameHeading={t("breakdown.feature")}
        rows={byFeature.map((row) => ({ ...row, key: row.feature, name: featureName(row.feature), priced: true }))}
      />
      <BreakdownTable
        title={t("breakdown.models")}
        nameHeading={t("breakdown.model")}
        rows={byModel.map((row) => ({ ...row, key: row.model, name: row.model }))}
      />
    </div>
  );
}
