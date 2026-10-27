"use client";

// A report's charts (reports): six months of new leads beside the ones won, and of sales; and when leads arrive, by hour
// of the day and by weekday, so someone is there to answer. Each chart has its numbers in a table for screen readers.
import type { SalesReport } from "@travel-crm/contracts/reports";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { rupees } from "@/components/forms/money-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCount } from "@/lib/format";

const monthWords = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });
const monthOf = (month: string) => monthWords.format(new Date(`${month}-01T00:00:00Z`));

export function MonthsCard({ report }: { report: SalesReport }) {
  const t = useTranslations("reports.months");
  const leads = {
    leads: { label: t("leads"), color: "var(--color-people)" },
    won: { label: t("won"), color: "var(--color-action)" },
  } satisfies ChartConfig;
  const sales = { salesRupees: { label: t("sales"), color: "var(--color-money)" } } satisfies ChartConfig;
  const data = report.months.map((month) => ({
    ...month,
    label: monthOf(month.month),
    salesRupees: month.salesPaise / 100,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <figure className="flex flex-col gap-2">
          <figcaption className="text-label text-muted-foreground">{t("leadsAndWon")}</figcaption>
          <ChartContainer config={leads} className="aspect-auto h-56 w-full" role="img" aria-label={t("leadsAndWon")}>
            <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="leads" fill="var(--color-leads)" radius={4} isAnimationActive={false} />
              <Bar dataKey="won" fill="var(--color-won)" radius={4} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </figure>
        <figure className="flex flex-col gap-2">
          <figcaption className="text-label text-muted-foreground">{t("sales")}</figcaption>
          <ChartContainer config={sales} className="aspect-auto h-56 w-full" role="img" aria-label={t("sales")}>
            <BarChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(value: number) => rupees(Math.round(value * 100))}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent formatter={(value) => rupees(Math.round(Number(value) * 100))} />}
              />
              <Bar dataKey="salesRupees" fill="var(--color-salesRupees)" radius={4} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </figure>
        <table className="sr-only">
          <caption>{t("title")}</caption>
          <tbody>
            {report.months.map((month) => (
              <tr key={month.month}>
                <th scope="row">{monthOf(month.month)}</th>
                <td>{formatCount(month.leads)}</td>
                <td>{formatCount(month.won)}</td>
                <td>{rupees(month.salesPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function TimingCard({ report }: { report: SalesReport }) {
  const t = useTranslations("reports.timing");
  const config = { leads: { label: t("leads"), color: "var(--color-people)" } } satisfies ChartConfig;
  const weekdays = t.raw("weekdays") as string[];
  const hours = report.byHour.map((row) => ({ leads: row.leads, label: `${String(row.hour).padStart(2, "0")}:00` }));
  const days = report.byWeekday.map((row) => ({
    leads: row.leads,
    label: weekdays[row.weekday] ?? String(row.weekday),
  }));
  const busiest = [...report.byHour].sort((a, b) => b.leads - a.leads)[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {busiest === undefined || busiest.leads === 0
            ? t("intro")
            : t("busiest", {
                from: `${String(busiest.hour).padStart(2, "0")}:00`,
                to: `${String((busiest.hour + 1) % 24).padStart(2, "0")}:00`,
              })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {[
          { key: "byHour", data: hours },
          { key: "byWeekday", data: days },
        ].map((chart) => (
          <figure key={chart.key} className="flex flex-col gap-2">
            <figcaption className="text-label text-muted-foreground">
              {t(chart.key as "byHour" | "byWeekday")}
            </figcaption>
            <ChartContainer
              config={config}
              className="aspect-auto h-48 w-full"
              role="img"
              aria-label={t(chart.key as "byHour" | "byWeekday")}
            >
              <BarChart data={chart.data} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="leads" fill="var(--color-leads)" radius={3} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          </figure>
        ))}
      </CardContent>
    </Card>
  );
}
