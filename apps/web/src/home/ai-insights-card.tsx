"use client";

// "AI insights" (spec 5), for whoever manages the AI: the AI calls used this month against the monthly limit as a small
// pie (always this month: the limit is monthly), and the chats it answered in the chosen period, counting up.
import type { Period } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { Pie, PieChart } from "recharts";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useChatsAnswered } from "@/ai/use-chats-answered";
import { useAiSettings } from "@/ai/use-ai";
import { formatCount } from "@/lib/format";
import { CountUp } from "./count-up";
import { HomeCard } from "./home-card";

/** The AI wears the people violet; what is left of the limit is the muted ring. */
const config = {
  used: { color: "var(--brand-people)" },
  left: { color: "var(--color-muted)" },
} satisfies ChartConfig;

export function AiInsightsCard({ period }: { period: Period }) {
  const t = useTranslations("home.ai");
  const tPeriod = useTranslations("home.period");
  const settings = useAiSettings();
  const chats = useChatsAnswered(period);
  const failed = settings.isError ? settings : chats.isError ? chats : null;
  return (
    <HomeCard title={t("title")}>
      {failed !== null && (
        <LoadFailedAlert
          message={t("loadFailed")}
          error={failed.error}
          onRetry={() => {
            void settings.refetch();
            void chats.refetch();
          }}
        />
      )}
      <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
        <div className="flex items-center gap-4">
          <ChartContainer config={config} className="aspect-square size-20 shrink-0" role="img" aria-label={t("chart")}>
            <PieChart>
              <Pie
                data={[
                  { part: "used", count: settings.data?.usedThisMonth ?? 0, fill: "var(--color-used)" },
                  {
                    part: "left",
                    count: Math.max((settings.data?.monthlyLimit ?? 0) - (settings.data?.usedThisMonth ?? 0), 0),
                    fill: "var(--color-left)",
                  },
                ]}
                dataKey="count"
                nameKey="part"
                innerRadius={26}
                outerRadius={38}
                stroke="none"
                isAnimationActive={false}
              />
            </PieChart>
          </ChartContainer>
          {settings.data === undefined ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <p className="max-w-48 text-label">
              {t.rich("calls", {
                used: formatCount(settings.data.usedThisMonth),
                limit: formatCount(settings.data.monthlyLimit),
                n: (figure) => <span className="numbers">{figure}</span>,
              })}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-label text-muted-foreground">
            {t("chats")} · {tPeriod(period)}
          </span>
          {chats.data === undefined ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <span className="numbers text-number-lg font-medium">
              <CountUp value={chats.data.chats} />
            </span>
          )}
        </div>
      </div>
    </HomeCard>
  );
}
