"use client";

// "AI insights" (spec 5), for whoever manages the AI: two figures side by side, each a muted label over a mono value.
// The chats the AI answered in the chosen period, counting up; and the AI calls used this month against the monthly
// limit (always this month: the limit is monthly), with a bar of how much of it is used. The figures and the bar wear
// the people violet, the AI's colour, so the card reads as the AI's even when its numbers are 0.
import type { Period } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useChatsAnswered } from "@/ai/use-chats-answered";
import { useAiSettings } from "@/ai/use-ai";
import { formatCount } from "@/lib/format";
import { CountUp } from "./count-up";
import { HomeCard } from "./home-card";

export function AiInsightsCard({ period }: { period: Period }) {
  const t = useTranslations("home.ai");
  const tPeriod = useTranslations("home.period");
  const settings = useAiSettings();
  const chats = useChatsAnswered(period);
  const failed = settings.isError ? settings : chats.isError ? chats : null;
  const calls = settings.data;
  const usedShare =
    calls === undefined || calls.monthlyLimit === 0
      ? 0
      : Math.min(Math.round((calls.usedThisMonth / calls.monthlyLimit) * 100), 100);
  return (
    <HomeCard title={t("title")} tint="violet">
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
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-label text-muted-foreground">
            {t("chats")} · {tPeriod(period)}
          </span>
          {chats.data === undefined ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <span className="numbers text-number-lg font-medium text-(--brand-people-tint-ink)">
              <CountUp value={chats.data.chats} />
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-label text-muted-foreground">{t("calls")}</span>
          {calls === undefined ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <>
              <span className="text-label text-muted-foreground">
                {t.rich("callsUsed", {
                  used: formatCount(calls.usedThisMonth),
                  limit: formatCount(calls.monthlyLimit),
                  value: (figure) => (
                    <span className="numbers text-number-lg font-medium text-(--brand-people-tint-ink)">{figure}</span>
                  ),
                  n: (figure) => <span className="numbers">{figure}</span>,
                })}
              </span>
              <Progress
                value={usedShare}
                aria-label={t("chart")}
                className="mt-2 h-2 bg-[color-mix(in_oklab,var(--brand-people)_24%,var(--card))] [&>[data-slot=progress-indicator]]:bg-people"
              />
            </>
          )}
        </div>
      </div>
    </HomeCard>
  );
}
