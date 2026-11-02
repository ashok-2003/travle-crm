"use client";

// The last 30 days of AI calls: answered and failed stacked by day (two series, so a legend), the cost in the tooltip, and
// the same numbers in a table for screen readers (the chart itself is a picture to them).
import type { AiOverview } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCalendarDay, formatCount } from "@/lib/format";
import { rupeesOf } from "../growth/usage-screen";

export function AiDaysChart({ days }: { days: AiOverview["days"] }) {
  const t = useTranslations("consoleAi.days");
  const config = {
    answered: { label: t("calls"), color: "var(--color-action)" },
    failed: { label: t("failed"), color: "var(--color-status-bad-dot)" },
  } satisfies ChartConfig;
  const data = days.map((day) => ({ ...day, answered: day.calls - day.failed }));
  return (
    <section aria-labelledby="ai-days-heading" className="flex flex-col gap-3">
      <h2 id="ai-days-heading" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <figure className="flex flex-col gap-2">
        <ChartContainer config={config} className="aspect-auto h-64 w-full" role="img" aria-label={t("label")}>
          <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
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
              content={
                <ChartTooltipContent
                  labelFormatter={(day, payload) => {
                    const cost = (payload[0]?.payload as { costPaise?: number } | undefined)?.costPaise ?? 0;
                    return `${formatCalendarDay(String(day))} · ${rupeesOf(cost)}`;
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="answered" stackId="calls" fill="var(--color-answered)" isAnimationActive={false} />
            <Bar dataKey="failed" stackId="calls" fill="var(--color-failed)" isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
        <table className="sr-only">
          <caption>{t("table")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("heading")}</th>
              <th scope="col">{t("calls")}</th>
              <th scope="col">{t("failed")}</th>
              <th scope="col">{t("cost")}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.day}>
                <th scope="row">{formatCalendarDay(day.day)}</th>
                <td>{formatCount(day.calls)}</td>
                <td>{formatCount(day.failed)}</td>
                <td>{rupeesOf(day.costPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </section>
  );
}
