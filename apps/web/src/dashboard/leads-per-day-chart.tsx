"use client";

// New leads each day of the period: one series, so one colour (the people violet: leads are people) and no legend;
// thin bars with rounded tops, a recessive grid, a tooltip per bar, and the same numbers in a table for screen
// readers (the chart itself is a picture to them).
import type { Dashboard } from "@travel-crm/contracts/insights";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCalendarDay, formatCount } from "@/lib/format";

export function LeadsPerDayChart({ perDay }: { perDay: Dashboard["perDay"] }) {
  const t = useTranslations("dashboard.perDay");
  const config = { leads: { label: t("series"), color: "var(--color-people)" } } satisfies ChartConfig;
  return (
    <figure className="flex flex-col gap-2">
      <ChartContainer config={config} className="aspect-auto h-56 w-full" role="img" aria-label={t("label")}>
        <BarChart data={perDay} margin={{ left: -16, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tickFormatter={(day: string) => formatCalendarDay(day)}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent labelFormatter={(day) => formatCalendarDay(String(day))} />}
          />
          <Bar dataKey="leads" fill="var(--color-leads)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>{t("table")}</caption>
        <tbody>
          {perDay.map(({ day, leads }) => (
            <tr key={day}>
              <th scope="row">{formatCalendarDay(day)}</th>
              <td>{formatCount(leads)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
