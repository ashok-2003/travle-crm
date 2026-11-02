"use client";

// A report of the catalogue as the registry Table: its column headings and its row words are messages here, keyed by what the
// api names (column key, cell kind); the figures are the report's own.
import type { ReportAnswer, ReportColumnKind } from "@travel-crm/contracts/reports";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { waitWords } from "@/dashboard/duration";
import leads from "@/i18n/messages/en-IN/leads.json";
import reports from "@/i18n/messages/en-IN/reports.json";
import sales from "@/i18n/messages/en-IN/sales.json";
import { formatCount } from "@/lib/format";

const numeric = new Set<ReportColumnKind>(["count", "money", "minutes"]);

const known = <Words extends object>(words: Words) => {
  return (value: string): value is Extract<keyof Words, string> => Object.hasOwn(words, value);
};
const isMetric = known(reports.ask.metrics);
const isMethod = known(reports.ask.methods);
const isColumn = known(reports.ask.columns);
const isSource = known(leads.sources);
const isStage = known(leads.stages);
const isReason = known(sales.lost.reasons);

export function AnswerTable({ answer }: { answer: ReportAnswer }) {
  const t = useTranslations("reports.ask");
  const tSources = useTranslations("leads.sources");
  const tStages = useTranslations("leads.stages");
  const tReasons = useTranslations("sales.lost.reasons");
  const tDuration = useTranslations("dashboard.duration");
  const cell = (kind: ReportColumnKind, value: string | number | null): string => {
    if (value === null || value === "") return kind === "person" ? t("formerStaff") : "–";
    if (typeof value === "number") {
      return kind === "money" ? rupees(value) : kind === "minutes" ? waitWords(value, tDuration) : formatCount(value);
    }
    switch (kind) {
      case "metric":
        return isMetric(value) ? t(`metrics.${value}`) : value;
      case "method":
        return isMethod(value) ? t(`methods.${value}`) : value;
      case "source":
        return isSource(value) ? tSources(value) : value;
      case "stage":
        return isStage(value) ? tStages(value) : value;
      case "lostReason":
        return isReason(value) ? tReasons(value) : value;
      default:
        return value;
    }
  };
  if (answer.rows.length === 0) return <p className="text-muted-foreground">{t("noRows")}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {answer.columns.map((column) => (
            <TableHead key={column.key} className={numeric.has(column.kind) ? "text-right" : undefined}>
              {isColumn(column.key) ? t(`columns.${column.key}`) : column.key}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {answer.rows.map((row, index) => (
          <TableRow key={index}>
            {answer.columns.map((column, position) => (
              <TableCell
                key={column.key}
                className={numeric.has(column.kind) ? "numbers text-right" : position === 0 ? "font-medium" : undefined}
              >
                {cell(column.kind, row[column.key] ?? null)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
