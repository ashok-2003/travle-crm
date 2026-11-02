"use client";

// The console's AI usage (the owner, 2026-11-02): this month's calls, failures, tokens and cost (and at this pace), today
// in a line, the last 30 days, every agency's AI now (working, or why not and since when), the cost by feature and by
// model, the prices it is worked out from, and every call one by one. Read again every minute.
import {
  AlertTriangleIcon,
  BookOpenIcon,
  IndianRupeeIcon,
  PenLineIcon,
  SparklesIcon,
  TrendingUpIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { formatCount } from "@/lib/format";
import { Figures } from "../growth/figures";
import { rupeesOf } from "../growth/usage-screen";
import { AiBreakdown } from "./ai-breakdown";
import { AiCallsLog } from "./ai-calls-log";
import { AiDaysChart } from "./ai-days-chart";
import { AiOrganizations } from "./ai-organizations";
import { AiPrices } from "./ai-prices";
import { useAiOverview } from "./use-ai-usage";

export function AiUsageScreen() {
  const t = useTranslations("consoleAi");
  const tCommon = useTranslations("common");
  const overview = useAiOverview();
  const data = overview.data;

  let content;
  if (data === undefined) {
    content = overview.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={overview.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void overview.refetch()}
      />
    ) : (
      <LoadingRows rows={4} label={t("loading")} />
    );
  } else {
    const month = data.thisMonth;
    content = (
      <>
        <Figures
          wide
          label={t("figures.label")}
          figures={[
            { key: "calls", icon: SparklesIcon, value: formatCount(month.calls), label: t("figures.calls") },
            { key: "failed", icon: AlertTriangleIcon, value: formatCount(month.failed), label: t("figures.failed") },
            { key: "in", icon: BookOpenIcon, value: formatCount(month.inputTokens), label: t("figures.inputTokens") },
            { key: "out", icon: PenLineIcon, value: formatCount(month.outputTokens), label: t("figures.outputTokens") },
            { key: "cost", icon: IndianRupeeIcon, value: rupeesOf(month.costPaise), label: t("figures.cost") },
            {
              key: "projected",
              icon: TrendingUpIcon,
              value: rupeesOf(month.projectedPaise),
              label: t("figures.projected"),
            },
          ]}
        />
        <p className="text-muted-foreground">
          {t("today", {
            calls: data.today.calls,
            failed: formatCount(data.today.failed),
            cost: rupeesOf(data.today.costPaise),
          })}
        </p>
        <AiDaysChart days={data.days} />
        <AiOrganizations organizations={data.organizations} />
        <AiBreakdown byFeature={data.byFeature} byModel={data.byModel} />
        <AiPrices prices={data.prices} rate={data.usdInrRate} />
        <AiCallsLog organizations={data.organizations} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro", { rate: String(data?.usdInrRate ?? 96) })} />
      {content}
    </div>
  );
}
